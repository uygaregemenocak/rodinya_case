import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string = 'development';

  @Type(() => Number)
  @IsInt()
  PORT: number = 3000;

  @IsString()
  MONGO_URI: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL: number = 900;

  @Type(() => Number)
  @IsInt()
  @Min(300)
  JWT_REFRESH_TTL: number = 604800;

  @IsString()
  UPLOAD_DIR: string = './uploads';

  @IsString()
  @MinLength(32)
  STORAGE_SIGNING_SECRET: string;

  // seconds, S3 also doesn't allow more than 7 days
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(604800)
  PRESIGNED_URL_TTL: number = 300;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  PUBLIC_BASE_URL?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(validatedConfig);

  if (errors.length > 0) {
    const messages = errors.map((error) => {
      const constraints = Object.values(error.constraints ?? {});
      return `${error.property}: ${constraints.join(', ')}`;
    });
    throw new Error(`Invalid environment variables:\n${messages.join('\n')}`);
  }

  return validatedConfig;
}
