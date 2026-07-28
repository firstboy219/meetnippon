import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitFeedbackDto {
  @IsIn(['technical', 'policy', 'suggestion'])
  category!: 'technical' | 'policy' | 'suggestion';

  @IsString() @MinLength(3) @MaxLength(150)
  subject!: string;

  @IsString() @MinLength(5) @MaxLength(4000)
  message!: string;

  /** Where the user was when they hit the problem — helps reproduce it. */
  @IsOptional() @IsString() @MaxLength(200)
  page?: string;
}
