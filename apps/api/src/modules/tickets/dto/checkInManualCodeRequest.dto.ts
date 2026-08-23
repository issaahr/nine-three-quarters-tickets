import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CheckInManualCodeRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  public manualCode!: string;
}
