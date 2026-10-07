import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsMongoId } from 'class-validator';

export type PermissionAction = 'add' | 'remove';

export class UpdatePermissionDto {
  @ApiProperty({ example: '66f1c0c4e4b0a1b2c3d4e5f6' })
  @IsMongoId()
  userId: string;

  @ApiProperty({ enum: ['add', 'remove'], example: 'add' })
  @IsIn(['add', 'remove'])
  action: PermissionAction;
}
