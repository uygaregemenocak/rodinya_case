import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema.js';

// One session per login. We only keep a hash of the current refresh token's
// jti, it gets replaced every time the token is refreshed.
@Schema({ collection: 'sessions', timestamps: true, versionKey: false })
export class Session {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ required: true })
  tokenHash: string;

  // TTL index, mongo removes expired sessions by itself
  @Prop({ required: true, expires: 0 })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  @Prop()
  userAgent?: string;
}

export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);
