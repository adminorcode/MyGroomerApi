import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { createUser, findUserByEmail } from "../../modules/auth/user.service";
import { AppError } from "../../shared/errors";
import { CreateUserInput, Role } from "../../modules/auth/user.types";
import { isGoogleAuthEnabled } from '../../config/runtime.config';


export const initializePassport = () => {
    if (!isGoogleAuthEnabled()) return
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            let result 
    
            if(!profile?.emails?.length){
                return done(new AppError('Google account email not available.', 400))
            }
        
            const email = profile.emails[0].value
            const user = await findUserByEmail(email)
        
            if(user) return done(null, user)
        
            // create new user
            const userData:CreateUserInput = {
                name: profile.displayName,
                email,
                role: Role.CUSTOMER,
                profile_picture: profile.profileUrl,
                email_verified_at: new Date(),
                google_id: profile.id
            }
            result = await createUser(userData)
        
            return done(null, result)
    
        } catch (error) {
            return done(error)
        }
    }
    ))
}
