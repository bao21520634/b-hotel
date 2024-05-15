import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { check, validationResult } from 'express-validator';
import User from '../models/user';
import jwt from 'jsonwebtoken';
import verifyToken from '../middleware/auth';

const router = express.Router();
//login
router.post(
    '/login',
    [
        check('email', 'Email is required').isString(),
        check('password', 'Password with 6 or more characters is required').isLength({ min: 6 }),
    ],
    async (req: Request, res: Response) => {
        //check unvalid information
        const err = validationResult(req);
        console.log(err);
        console.log(req.body);
        if (!err.isEmpty()) {
            return res.status(400).json({
                message: err.array(),
            });
        }

        const { email, password } = req.body;
        //fetch user from database
        try {
            //check the email
            const user = await User.findOne({ email: email });
            console.log(user);
            if (user === null) {
                return res.status(400).json({ message: 'Invalid Credentials' });
            }
            //check the password
            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                return res.status(400).json({ message: 'Invalid Credentials' });
            }

            //send token
            const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET_KEY as string, { expiresIn: '1d' });
            res.cookie('auth_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 86400000,
            });

            return res.status(200).json({ message: 'Login successful', token });
        } catch (error) {
            console.log(error);
            return res.status(500).json({ message: 'Something went wrong' });
        }
    },
);

//validate token
router.get('/validate-token', verifyToken, (req: Request, res: Response) => {
    res.status(200).json({ userId: req.userId });
});

router.post('/logout', (req: Request, res: Response) => {
    res.cookie('auth_token', '', {
        expires: new Date(0),
    });
    res.send();
});
export default router;
