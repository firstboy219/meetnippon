import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PageQueryDto } from '../../common/pagination';

/**
 * What the reporting browser actually saw. Free-text fields are capped
 * generously (a stack trace can run long) but bounded — this is a client
 * submission, never trusted beyond "something to read", not executed or
 * templated anywhere.
 */
export class CreateErrorReportDto {
  @IsIn(['web-user', 'web-admin'])
  app!: string;

  @IsOptional() @IsString() @MaxLength(300)
  route?: string;

  @IsString() @MaxLength(2000)
  message!: string;

  @IsOptional() @Type(() => Number) @IsInt()
  status?: number;

  @IsOptional() @IsString() @MaxLength(300)
  endpoint?: string;

  @IsOptional() @IsString() @MaxLength(10)
  method?: string;

  @IsOptional() @IsString() @MaxLength(8000)
  stack?: string;

  @IsOptional() @IsString() @MaxLength(500)
  userAgent?: string;
}

export class ErrorReportQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['web-user', 'web-admin'])
  app?: string;

  /** Substring match on the message. */
  @IsOptional() @IsString() @MaxLength(200)
  q?: string;
}
