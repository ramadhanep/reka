import { Global, Module } from '@nestjs/common'
import { getConfig } from '@reka/config'
import { createDatabase, type Database } from '@reka/database'
import { DATABASE } from './database.token.js'

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): Database => createDatabase(getConfig().databaseUrl),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
