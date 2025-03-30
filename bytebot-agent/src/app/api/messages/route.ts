import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MessageType, Prisma } from '@prisma/client';

// Define types for Anthropic message content blocks
interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ImageSource {
  type: 'base64';
  media_type: string;
  data: string;
}

interface ImageBlock {
  type: 'image';
  source: ImageSource;
}

interface ToolResultContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: ImageSource;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: ToolResultContentBlock[];
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ImageBlock;

// Interface for the transformed message that will be sent to the client
interface TransformedMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt: Date;
  images?: {
    data: string;
    mediaType: string;
  }[];
}

// Database message type
interface DbMessage {
  id: string;
  content: unknown;
  type: MessageType;
  createdAt: Date;
  updatedAt: Date;
  taskId: string;
  summaryId: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');
    const lastMessageId = searchParams.get('lastMessageId');
    
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    // Build the query to get messages for the task
    const query: Prisma.MessageFindManyArgs = {
      where: {
        taskId: taskId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    };

    // If lastMessageId is provided, only get messages after that ID
    if (lastMessageId) {
      const lastMessage = await prisma.message.findUnique({
        where: { id: lastMessageId },
        select: { createdAt: true },
      });

      if (lastMessage) {
        query.where = {
          ...query.where,
          createdAt: {
            gt: lastMessage.createdAt,
          },
        };
      }
    }

    const messages = await prisma.message.findMany(query);
    console.log(`Found ${messages.length} new messages for task ${taskId}`);

    // Group messages by type to combine tool use/result with text messages
    const messagesByType = new Map<string, DbMessage[]>();
    
    // First pass: group messages by their timestamp (rounded to the nearest second)
    messages.forEach(message => {
      const timestamp = new Date(message.createdAt).getTime();
      const roundedTimestamp = Math.floor(timestamp / 1000) * 1000; // Round to nearest second
      const key = `${message.type}_${roundedTimestamp}`;
      
      if (!messagesByType.has(key)) {
        messagesByType.set(key, []);
      }
      messagesByType.get(key)?.push(message);
    });

    // Transform the messages to a format suitable for the frontend
    const transformedMessages: TransformedMessage[] = [];
    
    // Process each group of messages
    for (const groupedMessages of messagesByType.values()) {
      // Sort messages by createdAt to ensure correct order
      groupedMessages.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      // Combine all content from the grouped messages
      let displayContent = '';
      const images: { data: string; mediaType: string }[] = [];
      let hasTextContent = false;
      
      for (const message of groupedMessages) {
        const content = message.content as unknown as ContentBlock[];
        
        if (Array.isArray(content)) {
          // Process content blocks
          for (const block of content) {
            if (block && typeof block === 'object') {
              // Process text blocks
              if (block.type === 'text' && 'text' in block) {
                displayContent += block.text;
                hasTextContent = true;
              } 
              // Process image blocks
              else if (block.type === 'image' && 'source' in block && block.source) {
                if (block.source.type === 'base64' && block.source.data) {
                  images.push({
                    data: block.source.data,
                    mediaType: block.source.media_type || 'image/png'
                  });
                }
              }
              // Extract images from tool_result blocks
              else if (block.type === 'tool_result' && 'content' in block && Array.isArray(block.content)) {
                for (const resultBlock of block.content) {
                  if (resultBlock && typeof resultBlock === 'object') {
                    // Extract text from tool results for error messages
                    if (resultBlock.type === 'text' && 'text' in resultBlock) {
                      const text = resultBlock.text || '';
                      // Only include error messages from tool results
                      if (text.includes('ERROR')) {
                        displayContent += `\n${text}\n`;
                        hasTextContent = true;
                      }
                    }
                    // Extract images from tool results
                    else if (resultBlock.type === 'image' && 'source' in resultBlock && resultBlock.source) {
                      if (resultBlock.source.type === 'base64' && resultBlock.source.data) {
                        images.push({
                          data: resultBlock.source.data,
                          mediaType: resultBlock.source.media_type || 'image/png'
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        } else if (typeof content === 'string') {
          displayContent += content;
          hasTextContent = true;
        }
      }
      
      // Only create a message if there's actual content to display
      if (hasTextContent || images.length > 0) {
        // Use the first message in the group for ID and metadata
        const firstMessage = groupedMessages[0];
        
        const transformedMessage: TransformedMessage = {
          id: firstMessage.id,
          content: displayContent.trim(),
          role: firstMessage.type === MessageType.USER ? 'user' : 'assistant',
          createdAt: firstMessage.createdAt,
        };
        
        // Only add images property if there are images
        if (images.length > 0) {
          transformedMessage.images = images;
        }
        
        transformedMessages.push(transformedMessage);
      }
    }
    
    // Sort the final messages by createdAt
    transformedMessages.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    console.log(`Transformed ${messages.length} DB messages into ${transformedMessages.length} chat messages`);

    return NextResponse.json({ messages: transformedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
