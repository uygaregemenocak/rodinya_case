import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsStrongPassword,
  MaxLength,
} from 'class-validator';
import { normalizeEmail } from './normalize-email.js';

export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    example: 'Passw0rd!',
    description:
      'Min 8 characters, needs an uppercase, a lowercase and a digit',
  })
  @IsString()
  @MaxLength(128)
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 0,
    },
    {
      message:
        'password must be at least 8 characters and contain an uppercase letter, a lowercase letter and a digit',
    },
  )
  password: string;
}
