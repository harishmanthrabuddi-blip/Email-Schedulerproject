import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import dotenv from 'dotenv';
import * as userRepository from '../repositories/userRepository';

dotenv.config();

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
export const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL ||
  (process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/api/auth/google/callback`
    : 'http://localhost:5000/api/auth/google/callback');
export const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL : 'http://localhost:3000');


if (
  GOOGLE_CLIENT_ID &&
  GOOGLE_CLIENT_ID !== 'your_google_client_id_here' &&
  GOOGLE_CLIENT_SECRET &&
  GOOGLE_CLIENT_SECRET !== 'your_google_client_secret_here'
) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
        try {
          const googleId = profile.id;
          const email =
            profile.emails && profile.emails.length > 0 ? profile.emails[0].value : '';
          const name = profile.displayName || email || 'Google User';
          const avatar =
            profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;

          if (!email) {
            return done(new Error('Google OAuth profile did not return an email address'));
          }

          // 1. Find user by Google ID
          let user = await userRepository.findUserByGoogleId(googleId);

          if (!user) {
            // 2. Find user by email
            const existingEmailUser = await userRepository.findUserByEmail(email);
            if (existingEmailUser) {
              // 3. Attach/update Google ID & avatar
              user = await userRepository.updateUserGoogleId(
                existingEmailUser.id,
                googleId,
                avatar
              );
            } else {
              // 4. Create new user
              user = await userRepository.createUser({
                googleId,
                name,
                email,
                avatar,
              });
            }
          }

          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
} else {
  console.warn(
    '[Passport] GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not fully configured in environment.'
  );
}

// Passport serialization: store only user.id in session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Passport deserialization: fetch user record from PostgreSQL database
passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await userRepository.findUserById(id);
    if (!user) {
      return done(null, false);
    }
    done(null, user);
  } catch (error) {
    done(error);
  }
});

export default passport;
