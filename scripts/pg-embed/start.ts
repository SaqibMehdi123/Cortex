// Local throwaway Postgres for sandbox e2e testing (no root needed).
// Starts on 127.0.0.1:5433 with user postgres / postgres, db cortex.
import EmbeddedPostgres from 'embedded-postgres'
import fs from 'node:fs'

const pg = new EmbeddedPostgres({
  databaseDir: '/home/z/my-project/scripts/pg-embed/pgdata',
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
})

async function main() {
  // skip initialise() when the cluster already exists (restart case)
  if (!fs.existsSync('/home/z/my-project/scripts/pg-embed/pgdata/PG_VERSION')) {
    await pg.initialise()
  }
  await pg.start()
  try {
    await pg.createDatabase('cortex')
  } catch {
    // already exists on restart
  }
  console.log('PG ready on 127.0.0.1:5433 db=cortex')
  // keep the process alive
  setInterval(() => {}, 60_000)
}

main().catch((e) => {
  console.error('pg-embed failed', e)
  process.exit(1)
})
