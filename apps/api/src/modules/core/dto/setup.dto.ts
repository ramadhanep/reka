import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'

export class SetupDto {
  @IsEmail()
  @MaxLength(320)
  email!: string

  @IsString()
  @MinLength(10)
  @MaxLength(1024)
  password!: string

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  organizationName!: string
}
