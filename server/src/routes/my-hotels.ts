import express, { Request, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import Hotel from '../models/hotel';
import cloudinary from 'cloudinary';
import { body } from 'express-validator';
import verifyToken from '../middleware/auth';
import { HotelType } from '../shared/types';

const router = express.Router();
//store in the memory and upload to cloudinary later
const storage = multer.memoryStorage();
//define upload limit
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, //5MB upload limit
    },
});

//add hotels
router.post(
    '/',
    [
        body('name').notEmpty().withMessage('Name is required'),
        body('address').notEmpty().withMessage('Address is required'),
        body('description').notEmpty().withMessage('Description is required'),
        body('type').notEmpty().withMessage('Hotel type is required'),
        body('pricePerNightWeekdays')
            .notEmpty()
            .isNumeric()
            .withMessage('Price per night is required and must be a number'),
        body('pricePerNightWeekends')
            .notEmpty()
            .isNumeric()
            .withMessage('Price per night is required and must be a number'),
        body('facilities').notEmpty().isArray().withMessage('Facilities are required'),
    ],
    verifyToken,
    upload.array('imageFiles', 6),

    async (req: Request, res: Response) => {
        try {
            console.log(req.body);

            const { address, ...info } = req.body;

            // const imageFiles = req.files as Express.Multer.File[];
            const newHotel: HotelType = info;

            //1. Upload the images to Cloudinary

            const locationSearchParams = new URLSearchParams({
                address: address,
                api_key: process.env.GOONG_API_KEY,
            } as any);

            const [location] = await Promise.all([
                // uploadImages(imageFiles),
                axios({
                    method: 'GET',
                    url: `https://rsapi.goong.io/Geocode?${locationSearchParams.toString()}`,
                }),
            ]);

            //2. if upload was successful, add the URLs to the new hotel
            newHotel.location = {
                coordinates: [
                    location.data.results[0].geometry.location.lng,
                    location.data.results[0].geometry.location.lat,
                ],
            };

            newHotel.address = address;
            newHotel.imageUrls = ['https://placehold.co/600x400?text=Hello+World'];
            newHotel.lastUpdated = new Date();
            newHotel.userId = req.userId;
            newHotel.city = location.data.results[0].compound.province;
            newHotel.country = 'Viet Nam';

            //3. save the new hotel to database
            const hotel = new Hotel(newHotel);
            await hotel.save();
            //4. return a 201 status code
            res.status(201).send(hotel);
        } catch (error) {
            console.log(error);
            res.status(500).json({ message: 'Something went wrong' });
        }
    },
);

//view my hotel
router.get('/', verifyToken, async (req: Request, res: Response) => {
    try {
        console.log(req.userId);
        const hotels = await Hotel.find({ userId: req.userId });

        res.json(hotels);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Error fetching hotel' });
    }
});
//edit hotel
router.get('/:id', verifyToken, async (req: Request, res: Response) => {
    const id = req.params.id.toString();
    try {
        const hotel = await Hotel.findOne({ _id: id, userId: req.userId });
        res.json(hotel);
    } catch (error) {
        res.status(500).json({ message: 'Error: fetching hotel' });
    }
});

router.put('/:hotelId', verifyToken, upload.array('imageFiles'), async (req: Request, res: Response) => {
    try {
        const updatedHotel: HotelType = req.body;
        updatedHotel.lastUpdated = new Date();

        const hotel = await Hotel.findOneAndUpdate(
            {
                _id: req.params.hotelId,
                userId: req.userId,
            },
            updatedHotel,
            { new: true },
        );

        if (!hotel) {
            return res.status(404).json({ message: 'Hotel not found' });
        }

        const files = req.files as Express.Multer.File[];
        const updatedImageUrls = await uploadImages(files);

        hotel.imageUrls = [...updatedImageUrls, ...(updatedHotel.imageUrls || [])];

        await hotel.save();
        res.status(201).json(hotel);
    } catch (error) {
        res.status(500).json({ message: 'Something went throw' });
    }
});

async function uploadImages(imageFiles: Express.Multer.File[]) {
    const uploadPromises = imageFiles.map(async (image) => {
        const b64 = Buffer.from(image.buffer).toString('base64');
        let dataURI = 'data:' + image.mimetype + ';base64,' + b64;
        const res = await cloudinary.v2.uploader.upload(dataURI);
        return res.url;
    });

    const imageUrls = await Promise.all(uploadPromises);
    return imageUrls;
}

export default router;
