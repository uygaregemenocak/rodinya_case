import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token from login, register or refresh' })
  @IsString()
  @MaxLength(2048)
  refreshToken: string;
}
