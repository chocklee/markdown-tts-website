import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user']
  }

  interface User {
    passwordChangedAt?: Date | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string
    pwdChangedAt?: number | null
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    uid?: string
    pwdChangedAt?: number | null
  }
}
