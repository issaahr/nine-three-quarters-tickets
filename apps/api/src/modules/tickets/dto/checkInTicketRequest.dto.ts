import { IsNotEmpty, IsString } from 'class-validator';

export class CheckInTicketRequestDto {
  @IsString()
  @IsNotEmpty()
  public credential!: string;
}
