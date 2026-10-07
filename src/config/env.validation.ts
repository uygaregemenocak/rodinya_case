import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, MinLength, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string = 'development';

  @Type(() => Number)
  @IsInt()
  PORT: number = 3000;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;
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
