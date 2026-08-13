import NextAuth from 'next-auth'
import PostgresAdapter from '@auth/pg-adapter'
import { authConfig } from '@/lib/auth/config'
import { pool } from '@/lib/db/pool'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PostgresAdapter(pool),
})
