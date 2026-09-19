import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lower-case, dash-separated' })
  @MaxLength(80)
  slug?: string
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lower-case, dash-separated' })
  @MaxLength(80)
  slug?: string
}

export class AddMemberDto {
  @IsEmail()
  @MaxLength(320)
  email!: string

  @IsUUID()
  roleId!: string
}

export class UpdateMemberDto {
  @IsOptional()
  @IsUUID()
  roleId?: string

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string
}
