import { Router, Request, Response, NextFunction } from 'express';
import passport, { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRONTEND_URL } from '../config/passport';
import pool from '../config/database';

const router = Router();

// GET /api/auth/dev-login -> Local development shortcut when Google OAuth keys are unconfigured
router.get('/dev-login', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = 1 LIMIT 1');
    const devUser = result.rows[0] || { id: 1, google_id: null, name: 'Development User', email: 'dev@example.com' };

    req.logIn(devUser, (err) => {
      if (err) {
        console.error('Dev login session error:', err);
        res.redirect('/?error=' + encodeURIComponent('Dev login failed'));
        return;
      }
      res.redirect('/');
    });
  } catch (error) {
    console.error('Dev login error:', error);
    res.redirect('/?error=' + encodeURIComponent('Dev login failed'));
  }
});

// GET /api/auth/google -> Initiate Google OAuth flow
router.get('/google', (req: Request, res: Response, next: NextFunction): void => {
  if (
    !GOOGLE_CLIENT_ID ||
    GOOGLE_CLIENT_ID === 'your_google_client_id_here' ||
    !GOOGLE_CLIENT_SECRET ||
    GOOGLE_CLIENT_SECRET === 'your_google_client_secret_here'
  ) {
    res.status(400).json({
      error: 'Google OAuth credentials are missing or unconfigured in backend/.env',
      message:
        'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env to enable real Google login.',
    });
    return;
  }

  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// GET /api/auth/google/callback -> Handle Google OAuth redirect callback
router.get(
  '/google/callback',
  (req: Request, res: Response, next: NextFunction): void => {
    passport.authenticate('google', (err: any, user: any, info: any) => {
      if (err) {
        console.error('Passport Google auth callback error:', err);
        res.redirect('/?error=' + encodeURIComponent(err.message || 'Authentication error'));
        return;
      }

      if (!user) {
        const msg = info?.message || 'Authentication failed';
        console.error('Passport Google auth failed:', msg);
        res.redirect('/?error=' + encodeURIComponent(msg));
        return;
      }

      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error('Error logging in user into Passport session:', loginErr);
          res.redirect('/?error=' + encodeURIComponent('Session error'));
          return;
        }

        // Successfully authenticated! Session stored in Redis, cookie set.
        res.redirect('/');
      });
    })(req, res, next);
  }
);

// GET /api/auth/me -> Return current authenticated user profile
router.get('/me', (req: Request, res: Response): void => {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    const user = req.user as any;
    res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || null,
        googleId: user.google_id || null,
      },
    });
    return;
  }

  res.status(401).json({
    authenticated: false,
  });
});

// POST /api/auth/logout -> Logout user, destroy Redis session, and clear cookie
router.post('/logout', (req: Request, res: Response): void => {
  req.logout((err) => {
    if (err) {
      console.error('Error during req.logout():', err);
    }
    if (req.session) {
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          console.error('Error destroying session in Redis:', destroyErr);
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logged out successfully' });
      });
    } else {
      res.clearCookie('connect.sid');
      res.status(200).json({ message: 'Logged out successfully' });
    }
  });
});

export default router;
