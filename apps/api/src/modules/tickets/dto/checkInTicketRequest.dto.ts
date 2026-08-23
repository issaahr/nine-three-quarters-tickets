import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CheckInTicketRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  public credential!: string;
}
