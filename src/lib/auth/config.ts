import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { pool } from '@/lib/db/pool'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'

const DUMMY_HASH = hashPassword('timing-equalizer-dummy')

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
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials, request) {
        if (isRateLimited(`login:${clientIp(request)}`, 10, 15 * 60 * 1000)) return null
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (!email || !password) return null
        let user: {
          id: string
          name: string | null
          email: string
          password_hash: string | null
          emailVerified: Date | null
          password_changed_at: Date | null
        } | undefined
        try {
          const { rows } = await pool.query<{
            id: string
            name: string | null
            email: string
            password_hash: string | null
            emailVerified: Date | null
            password_changed_at: Date | null
          }>(
            'SELECT id, name, email, password_hash, "emailVerified", password_changed_at FROM users WHERE lower(email) = lower($1)',
            [email],
          )
          user = rows[0]
        } catch (err) {
          console.error('authorize query failed', err)
          return null
        }
        if (!user || !user.password_hash || !user.emailVerified) {
          verifyPassword(password, DUMMY_HASH)
          return null
        }
        if (!verifyPassword(password, user.password_hash)) return null
        return { id: user.id, name: user.name, email: user.email, passwordChangedAt: user.password_changed_at }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const changedAt =
          (user as { passwordChangedAt?: Date | null; password_changed_at?: Date | null }).passwordChangedAt ??
          (user as { password_changed_at?: Date | null }).password_changed_at
        token.uid = user.id
        token.pwdChangedAt = changedAt ? new Date(changedAt).getTime() : null
        return token
      }
      if (!token.uid) return null
      try {
        const { rows } = await pool.query<{ password_changed_at: Date | null }>(
          'SELECT password_changed_at FROM users WHERE id = $1',
          [token.uid],
        )
        if (rows.length === 0) return null
        const pca = rows[0].password_changed_at
        if (!pca) return token
        if (typeof token.pwdChangedAt !== 'number') return null
        if (new Date(pca).getTime() > token.pwdChangedAt) return null
        return token
      } catch (err) {
        console.error('jwt callback failed', err)
        return null
      }
    },
    session({ session, token }) {
      if (typeof token.uid === 'string') session.user.id = token.uid
      return session
    },
  },
} satisfies NextAuthConfig
