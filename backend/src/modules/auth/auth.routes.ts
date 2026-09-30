import { Router } from 'express';
import { register, login, me, updateMe, refresh, changePassword, setup2fa, verify2fa, disable2fa,
         sendPhoneOtp, verifyPhoneOtp, forgotPassword, resetPassword,
         verificationStatus, logout, logoutAll } from './auth.controller';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/auth';

const router = Router();

/**
 * Never let a token-bearing response be stored.
 *
 * Registration, login and refresh return access and refresh tokens in the
 * body. That is normal for a token API and is what the client needs, but it
 * means any intermediary that caches the response holds a working session.
 * The assessment flagged these bodies as credential exposure; the bodies
 * carry no password and no hash, so the real exposure is a cached copy, and
 * this is what forecloses it.
 */
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
});

// A coarse backstop in front of the per-identifier caps in ./otp.
//
// The precise work is done there, keyed on the phone or address being targeted:
// five codes and five wrong guesses each. This limit exists only to stop one
// host cycling through many different numbers to do that damage in aggregate,
// so it is set well above what any single person does.
//
// Deliberately not tight. It keys on IP, and most Tanzanian mobile traffic
// arrives behind carrier-grade NAT, so a whole neighbourhood can share one
// address. A low ceiling here does not stop an attacker, who can rotate
// addresses; it stops strangers from resetting their own passwords because
// somebody else on the same carrier did it first.
const otpLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
});

router.post('/register', register);
router.post('/login',    login);
router.post('/refresh',  refresh);
router.post('/logout',   logout);
router.post('/logout-all', authenticate, logoutAll);
router.get ('/me',       authenticate, me);
router.patch('/me',      authenticate, updateMe);
router.put ('/password', authenticate, changePassword);
router.get ('/verification',   authenticate, verificationStatus);
router.post('/phone/send-otp', otpLimit, authenticate, sendPhoneOtp);
router.post('/phone/verify',   otpLimit, authenticate, verifyPhoneOtp);
router.post('/password/forgot', otpLimit, forgotPassword);
router.post('/password/reset',  otpLimit, resetPassword);
router.post('/2fa/setup',   authenticate, setup2fa);
router.post('/2fa/verify',  authenticate, verify2fa);
router.post('/2fa/disable', authenticate, disable2fa);

export default router;
