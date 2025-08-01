import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentModule } from './agent/agent.module';
import { TasksModule } from './tasks/tasks.module';
import { MessagesModule } from './messages/messages.module';
import { AnthropicModule } from './anthropic/anthropic.module';
import { OpenAIModule } from './openai/openai.module';
import { GoogleModule } from './google/google.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './auth';
import { SummariesModule } from './summaries/summaries.modue';

const authEnabled = process.env.AUTH_ENABLED === 'true';

@Module({
  imports: [
    ...(authEnabled
      ? [
          AuthModule.forRoot(auth, {
            disableTrustedOriginsCors: false,
          }),
        ]
      : []),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AgentModule,
    TasksModule,
    MessagesModule,
    SummariesModule,
    AnthropicModule,
    OpenAIModule,
    GoogleModule,
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
