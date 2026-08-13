import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { pool } from '@/lib/db/pool'
import { verifyPassword } from '@/lib/auth/password'

export const authConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
    Credentials({
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (!email || !password) return null
        const { rows } = await pool.query<{
          id: string
          name: string | null
          email: string
          password_hash: string | null
          emailVerified: Date | null
        }>(
          'SELECT id, name, email, password_hash, "emailVerified" FROM users WHERE email = $1',
          [email],
        )
        const user = rows[0]
        if (!user || !user.password_hash || !user.emailVerified) return null
        if (!verifyPassword(password, user.password_hash)) return null
        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id
      return token
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string
      return session
    },
  },
} satisfies NextAuthConfig
