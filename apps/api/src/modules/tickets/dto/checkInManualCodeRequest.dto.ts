import { IsNotEmpty, IsString } from 'class-validator';

export class CheckInManualCodeRequestDto {
  @IsString()
  @IsNotEmpty()
  public manualCode!: string;
}
