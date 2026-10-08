import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsMongoId } from 'class-validator';

// single source for the actions, validation and swagger use this list too
export const PERMISSION_ACTIONS = ['add', 'remove'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export class UpdatePermissionDto {
  @ApiProperty({ example: '66f1c0c4e4b0a1b2c3d4e5f6' })
  @IsMongoId()
  userId: string;

  @ApiProperty({ enum: PERMISSION_ACTIONS, example: 'add' })
  @IsIn(PERMISSION_ACTIONS)
  action: PermissionAction;
}
