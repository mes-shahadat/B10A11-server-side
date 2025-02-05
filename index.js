const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
var cookieParser = require('cookie-parser')
var cors = require('cors')
var jwt = require('jsonwebtoken');
require('dotenv').config()
const app = express()
const port = process.env.PORT || 5000;

app.use(cors({
    // remove trailing slash (i.e. from the end)
    origin: [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://vroom-rents.web.app",
        "https://vroom-rents.firebaseapp.com"
    ],
    credentials: true // without this browsers blocks cookies from crossorigin server
}))
app.use(cookieParser())
app.use(express.json())

const verifyToken = (req, res, next) => {

    if (req.cookies.token) {

        const token = req.cookies.token;

        jwt.verify(token, jwtSecret, (err, token) => {

            if (err) {

                res.clearCookie("token", {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'none'
                })
                res.status(401).json({ error: "token is invalid" })
            }
            else {
                req.user = token
                next()
            }
        });

    }
    else {
        res.status(401).json({ error: "token not found", timestamp: Date.now() })
    }
}

const uri = process.env.DB_URI;
const jwtSecret = process.env.JWT_SECRET

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {

    try {

        const database = client.db("car_rental");
        const allUser = database.collection("all users");
        const allCar = database.collection("all cars");
        const allBooking = database.collection("all bookings");
        const allOffer = database.collection("all offers");

        // try {
        //     const indexes = await allOffer.indexes();
        //     const ttlIndex = indexes.find(
        //         index => index.key.validUntil === 1 && index.expireAfterSeconds === 0
        //     );

        //     if (!ttlIndex) {

        //         console.log("Creating TTL index...");
        //         await allOffer.createIndex({ validUntil: 1 }, { expireAfterSeconds: 0 });
        //     } else {
        //         console.log("TTL index already exists");
        //     }
        // }
        // catch (err) { console.log(err.message) }

        // try {

        //     const changeStream = allOffer.watch(
        //         [
        //             { $match: { operationType: 'delete' } }
        //         ]
        //     );

        //     console.log('Watching for TTL deletions...');

        //     changeStream.on('change', async (change) => {

        //         await allCar.updateOne(
        //             { discountId: change.documentKey._id },
        //             {
        //                 $unset: {
        //                     discountId: 1,
        //                     discount: 1
        //                 }
        //             }
        //         )
        //     });

        // } catch (err) {
        //     console.error('Error:', err.message);
        // }

        // GET
        app.get('/', (req, res) => {

            res.send('car rental server is running...')
        })

        app.get('/user/:email', async (req, res) => {

            const email = req.params.email;

            const result = await allUser.findOne({ email: email });

            if (result) {

                const token = jwt.sign({ id: result?._id, email: result?.email }, jwtSecret);

                res.cookie("token", token, {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'none'
                })

                res.cookie("role", result.role, {
                    secure: true,
                    sameSite: 'none'
                })

                if (result.location) {
                    res.cookie("location", result.location, {
                        secure: true,
                        sameSite: 'none'
                    })
                }

                res.set({
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    'Surrogate-Control': 'no-store'
                });

                // browser caches GET reponse & sends a conditional request to the server (to check if reponse is same) & may avoid sending request as it knows response will be same.
                res.json({ message: "user found" })
            }
            else {
                res.clearCookie("token", {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'none'
                })
                res.status(401).json({ error: "user not found" })
            }

        })

        app.get("/my-cars", verifyToken, async (req, res) => {

            try {
                req.query.page ? null : req.query.page = 1;
                const date = req.query.date === "desc" ? -1 : 1;
                const price = req.query.price === "desc" ? -1 : 1;
                const limit = parseInt(req.query.limit) || 5;
                const page = parseInt(req.query.page) - 1 || 0;

                const highlight = {}

                if (req.query.date !== undefined) {
                    highlight.createdAt = date
                    highlight._id = 1
                }
                else if (req.query.price !== undefined) {
                    highlight.dailyPrice = price
                    highlight._id = 1
                }
                else {
                    highlight.title = 1
                    highlight._id = 1
                }

                const cursor = allCar.aggregate(
                    [
                        {
                            $match: { ownerId: new ObjectId(req.user.id) }
                        },
                        {
                            $lookup: {
                                from: "all offers",
                                localField: "_id",
                                foreignField: "discountedCarId",
                                as: "discountDetails"
                            }
                        },
                        {
                            $addFields: {
                                offerData: { $arrayElemAt: ["$discountDetails", 0] }
                            }
                        },
                        { $sort: highlight },
                        { $skip: limit * page },
                        { $limit: limit },
                        {
                            $project: {
                                ownerId: false,
                                discountDetails: false,
                                updatedAt: false
                            }
                        },
                    ]
                )

                const cursor2 = allCar.countDocuments(
                    {
                        ownerId: new ObjectId(req.user.id)
                    }
                )

                const [result, count] = await Promise.all([cursor.toArray(), cursor2])

                res.json(
                    {
                        totalItemCount: count,
                        estimatedViewCount: parseInt(req.query.page) * limit,
                        doc: result
                    }
                )
            }
            catch (err) {
                res.json({ error: err.message })
            }
        })

        app.get("/available-cars", async (req, res) => {

            try {
                req.query.page ? null : req.query.page = 1;
                const date = req.query.date === "desc" ? -1 : 1;
                const price = req.query.price === "desc" ? -1 : 1;
                const limit = parseInt(req.query.limit) || 5;
                const page = parseInt(req.query.page) - 1 || 0;
                const model = req.query.model
                const brand = req.query.brand
                const location = req.query.location
                const dealer = req.query.dealer
                const obj = {};

                if (model) {
                    obj.model = { $regex: req.query.model, $options: "i" }
                }
                else if (brand) {
                    obj.brand = { $regex: req.query.brand, $options: "i" }
                }
                else if (location) {
                    obj.location = { $regex: req.query.location, $options: "i" }
                }
                else if (dealer) {
                    obj.ownerId = new ObjectId(req.query.dealer)
                }
                else {
                    obj.availability = true;
                }

                const highlight = {}

                if (req.query.date !== undefined) {
                    highlight.createdAt = date
                    highlight._id = 1
                }
                else if (req.query.price !== undefined) {
                    highlight.dailyPrice = price
                    highlight._id = 1
                }
                else {
                    highlight.brand = 1
                    highlight._id = 1
                }

                const cursor = allCar.aggregate(
                    [
                        {
                            $match: obj
                        },
                        {
                            $lookup: {
                                from: "all offers",
                                localField: "_id",
                                foreignField: "discountedCarId",
                                as: "discountDetails"
                            }
                        },
                        {
                            $addFields: {
                                offerData: { $arrayElemAt: ["$discountDetails", 0] }
                            }
                        },
                        {
                            $addFields: {
                                discount: "$offerData.discountPercentage"
                            }
                        },
                        { $sort: highlight },
                        { $skip: limit * page },
                        { $limit: limit },
                        {
                            $project: {
                                ownerId: false,
                                updatedAt: false,
                                discountDetails: false,
                                "offerData.ownerId": false,
                                "offerData.discountedCarId": false
                            }
                        },
                    ]
                )

                const cursor2 = allCar.countDocuments(obj)

                const [result, count] = await Promise.all([cursor.toArray(), cursor2])

                res.json(
                    {
                        totalItemCount: count,
                        estimatedViewCount: parseInt(req.query.page) * limit,
                        doc: result
                    }
                )
            }
            catch (err) {
                res.json({ error: err.message })
            }
        })

        app.get('/car/:id', verifyToken, async (req, res) => {

            try {
                const id = new ObjectId(req.params.id)

                const result = await allCar.aggregate(
                    [
                        {
                            $match: { _id: id }
                        },
                        {
                            $lookup: {
                                from: "all users",
                                localField: "ownerId",
                                foreignField: "_id",
                                as: "ownerDetails"
                            }
                        },
                        {
                            $addFields: {
                                ownerData: { $arrayElemAt: ["$ownerDetails", 0] }
                            }
                        },
                        {
                            $lookup: {
                                from: "all offers",
                                localField: "_id",
                                foreignField: "discountedCarId",
                                as: "discountDetails"
                            }
                        },
                        {
                            $addFields: {
                                offerData: { $arrayElemAt: ["$discountDetails", 0] }
                            }
                        },
                        {
                            $project: {
                                ownerId: false,
                                ownerDetails: false,
                                "ownerData.password": false,
                                "ownerData.role": false,
                                discountDetails: false,
                            }
                        },
                    ]
                ).toArray()

                if (result.length > 0) {
                    res.json(result[0])
                } else {
                    res.json(result)
                }
            }
            catch (err) {
                res.json({ error: err.message })
            }
        })

        app.get("/booking-schedules/:id", verifyToken, async (req, res) => {

            try {
                const id = new ObjectId(req.params.id)
                const result = await allBooking.find(
                    {
                        carId: id,
                        status: { $nin: ["canceled", "completed"] }
                    },
                    {
                        projection: {
                            pickupDate: true,
                            dropoffDate: true
                        }
                    }
                ).toArray()

                res.json(result)
            }
            catch (err) {
                res.json({ error: err.message })
            }
        })

        app.get("/my-bookings", verifyToken, async (req, res) => {

            try {
                req.query.page ? null : req.query.page = 1;

                const id = new ObjectId(req.user.id);
                const date = req.query.date === "desc" ? -1 : 1;
                const limit = parseInt(req.query.limit) || 5;
                const page = parseInt(req.query.page) - 1 || 0;
                const filter = req.query.filter ? [req.query.filter] : ["pending", "canceled", "confirmed", "completed"];

                const pipeline = [
                    {
                        $match: {
                            userId: id,
                            status: { $in: filter }
                        }
                    },
                    {
                        $lookup: {
                            from: "all cars",
                            localField: "carId",
                            foreignField: "_id",
                            as: "carData"
                        }
                    },
                    {
                        $addFields: {
                            carData: { $arrayElemAt: ["$carData", 0] }
                        }
                    },
                    {
                        $addFields: {
                            firstImage: {
                                $arrayElemAt: ["$carData.images", 0]
                            }
                        }
                    },
                    {
                        $lookup: {
                            from: "all offers",
                            localField: "carData._id",
                            foreignField: "discountedCarId",
                            as: "discountDetails"
                        }
                    },
                    {
                        $addFields: {
                            offerData: { $arrayElemAt: ["$discountDetails", 0] }
                        }
                    },
                    {
                        $project: {
                            pickupDate: true,
                            dropoffDate: true,
                            pickupLocation: true,
                            dropOffLocation: true,
                            status: true,
                            totalPrice: true,
                            phone: true,
                            createdAt: true,
                            carData: {
                                _id: true,
                                model: true,
                                brand: true,
                                dailyPrice: true,
                                image: "$firstImage"
                            },
                            offerData: true
                        }
                    },
                    { $sort: { createdAt: date } }
                ]

                const cursor1 = allBooking.aggregate([
                    ...pipeline,
                    { $skip: limit * page },
                    { $limit: limit }
                ])

                const cursor2 = allBooking.aggregate([
                    ...pipeline,
                    { $count: 'totalCount' }
                ])

                const [result1, result2] = await Promise.all([
                    cursor1.toArray(),
                    cursor2.toArray()
                ])

                result2.length === 0 ? result2[0] = { totalCount: 0 } : null

                res.json(
                    {
                        totalItemCount: result2[0]?.totalCount,
                        estimatedViewCount: parseInt(req.query.page) * limit,
                        doc: result1
                    }
                )
            }
            catch (err) {
                res.json({ error: err.message })
            }
        })

        app.get("/my-rentals", verifyToken, async (req, res) => {

            try {

                req.query.page ? null : req.query.page = 1;
                const id = new ObjectId(req.user.id);
                const date = req.query.date === "desc" ? -1 : 1;
                const limit = parseInt(req.query.limit) || 5;
                const page = parseInt(req.query.page) - 1 || 0;
                const filter = req.query.filter ? [req.query.filter] : ["pending", "canceled", "confirmed", "completed"];

                const pipeline = [
                    {
                        $match: {
                            ownerId: id,
                            status: { $in: filter }
                        }
                    },
                    {
                        $lookup: {
                            from: "all cars",
                            localField: "carId",
                            foreignField: "_id",
                            as: "carData"
                        }
                    },
                    {
                        $addFields: {
                            carData: { $arrayElemAt: ["$carData", 0] }
                        }
                    },
                    {
                        $addFields: {
                            firstImage: {
                                $arrayElemAt: ["$carData.images", 0]
                            }
                        }
                    },
                    {
                        $lookup: {
                            from: "all users",
                            localField: "userId",
                            foreignField: "_id",
                            as: "userData"
                        }
                    },
                    {
                        $addFields: {
                            userData: { $arrayElemAt: ["$userData", 0] }
                        }
                    },
                    {
                        $project: {
                            pickupDate: true,
                            dropoffDate: true,
                            pickupLocation: true,
                            dropOffLocation: true,
                            status: true,
                            totalPrice: true,
                            phone: true,
                            createdAt: true,
                            userData: {
                                _id: true,
                                name: true,
                                email: true,
                                image: true,
                                lastLoginAt: true,
                                role: true,
                            },
                            carData: {
                                model: true,
                                brand: true,
                                dailyPrice: true,
                                image: "$firstImage"
                            },
                        }
                    },
                    { $sort: { createdAt: date } }
                ]

                const cursor1 = allBooking.aggregate([
                    ...pipeline,
                    { $skip: limit * page },
                    { $limit: limit }
                ])

                const cursor2 = allBooking.aggregate([
                    ...pipeline,
                    { $count: 'totalCount' }
                ])

                const [result1, result2] = await Promise.all([
                    cursor1.toArray(),
                    cursor2.toArray()
                ])

                result2.length === 0 ? result2[0] = { totalCount: 0 } : null

                res.json(
                    {
                        totalItemCount: result2[0]?.totalCount,
                        estimatedViewCount: parseInt(req.query.page) * limit,
                        doc: result1
                    }
                )
            }
            catch (err) {
                res.json({ error: err.message })
            }
        })

        app.get("/special-offer/:id", async (req, res) => {

            try {
                const id = new ObjectId(req.params.id);
                const result = await allOffer.findOne({ _id: id })

                if (result === null) {
                    return res.json({ error: "offer not found !" })
                }

                res.json(result)
            }
            catch (err) {
                res.json({ error: err.message })
            }
        })

        app.get("/special-offers", async (req, res) => {

            const limit = parseInt(req.query.limit) || 50;
            const result = await allOffer.aggregate(
                [
                    {
                        $lookup: {
                            from: "all cars",
                            localField: "discountedCarId",
                            foreignField: "_id",
                            as: "carData"
                        }
                    },
                    {
                        $addFields: {
                            carData: { $arrayElemAt: ["$carData", 0] }
                        }
                    },
                    {
                        $match: { "carData.availability": true }
                    },
                    {
                        $addFields: {
                            carImage: {
                                $arrayElemAt: ["$carData.images", 0]
                            }
                        }
                    },
                    {
                        $project: {
                            carData: false
                        }
                    }
                ]
            )
                .limit(limit)
                .sort(
                    {
                        validUntil: 1,
                        discountPercentage: -1
                    }
                )
                .toArray()

            res.json(result)
        })

        app.get("/recent-listings", async (req, res) => {

            const limit = parseInt(req.query.limit) || 50;
            const result = await allCar.find(
                { availability: true },
                {
                    projection: {
                        model: true,
                        brand: true,
                        registrationNumber: true,
                        dailyPrice: true,
                        availability: true,
                        bookingCount: true,
                        image: { $arrayElemAt: ["$images", 0] },
                        createdAt: true
                    }
                }
            )
                .limit(limit)
                .sort(
                    {
                        createdAt: 1,
                        bookingCount: -1
                    }
                )
                .toArray()

            res.json(result)
        })

        // POST
        app.post('/user', async (req, res) => {

            const doc = req.body;
            let insertResult = { message: "user found" };

            if (!req.body.email) {
                return res.json({ error: "email is required !" })
            }

            if (doc.lastLoginAt) {
                doc.lastLoginAt = new Date(parseInt(doc.lastLoginAt))
            }

            if (!doc.role) {
                doc.role = "customer"
            }

            let user = await allUser.findOne(
                { email: { $regex: req.body.email, $options: "i" } }
            )

            if (user) {
                doc.role = user.role
            }

            if (!user) {
                const result = await allUser.insertOne(doc);
                user = doc;
                insertResult = result
            }
            else if (!doc.login) {
                return res.json({ error: "email already exists in database !" })
            }

            if (doc.login) {

                const token = jwt.sign({ id: user?._id, email: user?.email }, jwtSecret);

                res.cookie("token", token, {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'none'
                })

                res.cookie("role", doc.role, {
                    secure: true,
                    sameSite: 'none'
                })

                if (user.location) {
                    res.cookie("location", user.location, {
                        secure: true,
                        sameSite: 'none'
                    })
                }

            }

            res.json({ ...insertResult })
        })

        app.post("/car", verifyToken, async (req, res) => {

            try {
                const doc = req.body
                doc.ownerId = new ObjectId(req.user.id);
                doc.bookingCount = 0
                doc.createdAt = new Date()
                doc.updatedAt = new Date()

                const result = await allCar.insertOne(doc);

                res.json(result)
            }
            catch (err) {
                res.json({ error: err.message })
            }

        })

        app.post("/booking", verifyToken, async (req, res) => {

            try {
                const data = req.body;
                data.carId = new ObjectId(data.carId)
                data.userId = new ObjectId(req.user.id)
                data.status = "pending"

                const pick = new Date(data.pickupDate);
                const drop = new Date(data.dropoffDate);

                const pickDate = new Date(`${pick.getFullYear()}-${pick.getMonth() + 1}-${pick.getDate()}`);
                const dropDate = new Date(`${drop.getFullYear()}-${drop.getMonth() + 1}-${drop.getDate()}`);

                if (pickDate.toISOString() === dropDate.toISOString()) {

                    return res.json({ error: "hourly rents are not allowed" })
                }

                data.pickupDate = pickDate
                data.dropoffDate = dropDate

                const carSchedules = await allBooking.find(
                    {
                        carId: data.carId,
                        status: { $nin: ["canceled", "completed"] }
                    },
                    {
                        projection: {
                            _id: false,
                            pickupDate: true,
                            dropoffDate: true
                        }
                    }
                ).toArray()

                // pickup date & dropoff date validation
                for (let i = 0; i < carSchedules.length; i++) {

                    let curPickDate = new Date(carSchedules[i].pickupDate)
                    let curDropDate = new Date(carSchedules[i].dropoffDate)

                    if ((pickDate.getTime() <= curDropDate.getTime() && pickDate.getTime() >= curPickDate.getTime())) {
                        return res.json({ error: `this car is already scheduled on ${pickDate.toDateString()} by someone` })
                    }
                    else if ((dropDate.getTime() >= curPickDate.getTime() && dropDate.getTime() <= curDropDate.getTime())) {
                        return res.json({ error: `this car is already scheduled on ${dropDate.toDateString()} by someone` })
                    }
                    else if ((curPickDate.getTime() <= dropDate.getTime() && curPickDate.getTime() >= pickDate.getTime())) {
                        return res.json({ error: `picked date range is overlapping with an booked schedule` })
                    }
                    // else if ((curDropDate.getTime() >= pickDate.getTime() && curDropDate.getTime() <= dropDate.getTime())) {
                    //     return res.json({error: `dropoff date is overlapping with someone else's schedule`})
                    // }

                }


                const oneDay = 24 * 60 * 60 * 1000;
                const diffDays = Math.round(Math.abs((pickDate - dropDate) / oneDay));

                const [bookCar] = await allCar.aggregate(
                    [
                        {
                            $match: { _id: data.carId }
                        },
                        {
                            $lookup: {
                                from: "all offers",
                                localField: "_id",
                                foreignField: "discountedCarId",
                                as: "discountDetails"
                            }
                        },
                        {
                            $addFields: {
                                offerData: { $arrayElemAt: ["$discountDetails", 0] }
                            }
                        },
                        {
                            $project: {
                                ownerId: true,
                                dailyPrice: true,
                                offerData: true
                            }
                        },
                    ]
                ).toArray()

                if (bookCar === null) {
                    return res.json({ error: "car not found !" })
                }

                data.ownerId = new ObjectId(bookCar.ownerId)

                if (req.user.id === bookCar.ownerId.toString()) {
                    return res.json({ error: "renting own cars are not allowed !" })
                }


                let discount = 0;

                if (bookCar.offerData) {

                    const { discountedCarId, discountPercentage, validUntil, minRentalDays, maxRentalDays } = bookCar.offerData;

                    if (discountedCarId.toString() === data.carId.toString()) {

                        if (Date.now() <= new Date(validUntil)) {

                            if (minRentalDays && maxRentalDays) {

                                if (diffDays >= minRentalDays && diffDays <= maxRentalDays) {
                                    discount = discountPercentage
                                }
                            }
                            else if (!minRentalDays && maxRentalDays) {

                                if (diffDays <= maxRentalDays) {
                                    discount = discountPercentage
                                }
                            }
                            else if (minRentalDays && !maxRentalDays) {

                                if (diffDays >= minRentalDays) {
                                    discount = discountPercentage
                                }
                            }
                            else {

                                discount = discountPercentage
                            }
                        }
                        else {
                            return res.json({ error: "offer expired, plz resubmit" })
                        }
                    }
                    else {

                        return res.json({ error: "offer.discountedCarId doesn't matches with this car's id !" })
                    }

                }

                if (discount) {

                    let discountedPrice = bookCar.dailyPrice * (discount / 100);
                    let discountedDaily = bookCar.dailyPrice - discountedPrice.toFixed(2)
                    data.totalPrice = Math.round(discountedDaily * diffDays)
                }
                else {
                    data.totalPrice = bookCar.dailyPrice * diffDays;
                }

                data.createdAt = new Date()
                data.updatedAt = new Date()

                const result = await allBooking.insertOne(data);


                allCar.updateOne(
                    { _id: data.carId },
                    { $inc: { bookingCount: 1 } }
                )

                res.json(result)
            }
            catch (err) {
                res.json({ error: err.message })
            }

        })

        app.post("/special-offer", verifyToken, async (req, res) => {

            const data = req.body;
            data.ownerId = new ObjectId(req.user.id)
            data.discountedCarId = new ObjectId(data.discountedCarId)
            data.validUntil = new Date(data.validUntil)

            if (data.discountPercentage === undefined) {
                return res.json({ error: "discount percentage is required !" })
            }

            const discountedCar = await allCar.findOne({
                _id: data.discountedCarId
            })

            if (discountedCar === null) {

                return res.json({ error: "car not found !" })
            }

            if (discountedCar?.ownerId.toString() === req.user.id) {

                const exists = await allOffer.findOne(
                    { discountedCarId: data.discountedCarId },
                    { projection: { ownerId: true } }
                )

                if (exists === null) {

                    data.createdAt = new Date()
                    data.updatedAt = new Date()

                    const result = await allOffer.insertOne(data)

                    return res.json(result)
                }

                return res.json({ error: "offer already exist for this car" })
            }

            res.json({ error: "can't add offer to someone's car" })
        })

        // PATCH
        app.patch("/user", verifyToken, async (req, res) => {

            try {

                const id = new ObjectId(req.user.id);
                delete req.body.id;

                if (req.body.lastLoginAt) {
                    req.body.lastLoginAt = new Date(req.body.lastLoginAt)
                }

                let find = await allUser.findOne(
                    { _id: id },
                    {
                        projection: {
                            role: true,
                            email: true
                        }
                    }
                )

                if (find.email === req.user.email) {

                    let user = await allUser.updateOne(
                        { _id: id },
                        {
                            $set: {
                                ...req.body
                            }
                        }
                    )

                    const token = jwt.sign({ id: find?._id, email: find?.email }, jwtSecret);

                    res.cookie("token", token, {
                        httpOnly: true,
                        secure: true,
                        sameSite: 'none'
                    })

                    if (req.body.location) {

                        res.cookie("location", req.body.location, {
                            secure: true,
                            sameSite: 'none'
                        })
                    }

                    if (req.body.role) {

                        res.cookie("role", req.body.role, {
                            secure: true,
                            sameSite: 'none'
                        })
                        res.cookie("location", req.location.role, {
                            secure: true,
                            sameSite: 'none'
                        })
                    }
                    else {

                        res.cookie("role", find.role, {
                            secure: true,
                            sameSite: 'none'
                        })
                        res.cookie("location", find.location, {
                            secure: true,
                            sameSite: 'none'
                        })
                    }


                    return res.json(user)
                }

                res.json({ error: "user update failed !" })
            }
            catch (err) {
                res.json({ error: err.message })
            }
        })

        app.patch("/car/:id", verifyToken, async (req, res) => {

            try {

                delete req.body?.bookingCount

                const id = new ObjectId(req.params.id)
                const updatingDoc = await allCar.findOne(
                    { _id: id },
                    { projection: { ownerId: true } }
                )

                if (updatingDoc === null) {
                    return res.json({ error: "car not found" })
                }

                if (updatingDoc?.ownerId?.toString() === req.user.id) {

                    const result = await allCar.updateOne(
                        { _id: id },
                        {
                            $set: {
                                ...req.body
                            }
                        }
                    )
                    res.json(result)
                }
                else {
                    res.json({ error: "not your car" })
                }
            }
            catch (err) {
                res.json({ error: err.message })
            }

        })

        app.patch("/booking/:id", verifyToken, async (req, res) => {

            try {
                const id = new ObjectId(req.params.id);
                const result = await allBooking.findOne({ _id: id })

                const [car] = await allCar.aggregate(
                    [
                        {
                            $match: { _id: result.carId }
                        },
                        {
                            $lookup: {
                                from: "all offers",
                                localField: "_id",
                                foreignField: "discountedCarId",
                                as: "discountDetails"
                            }
                        },
                        {
                            $addFields: {
                                offerData: { $arrayElemAt: ["$discountDetails", 0] }
                            }
                        },
                        {
                            $project: {
                                dailyPrice: true,
                                offerData: true
                            }
                        },
                    ]
                ).toArray()


                if (car === null) {
                    return res.json({ error: "car not found !" })
                }

                if (result.userId.toString() === req.user.id) {

                    if (req.body.status === "canceled") {

                        if (result.status === "pending") {

                            const bookingResult = await allBooking.updateOne(
                                { _id: id },
                                {
                                    $set: {
                                        status: "canceled",
                                        updatedAt: new Date()
                                    }
                                }
                            )

                            allCar.updateOne(
                                { _id: result.carId },
                                { $inc: { bookingCount: -1 } }
                            )

                            return res.json(bookingResult)
                        }
                        else if (result.status !== "canceled") {

                            const date = new Date();
                            const curDate = new Date(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`)

                            if (curDate < result.pickupDate) {

                                const bookingResult = await allBooking.updateOne(
                                    { _id: id },
                                    {
                                        $set: {
                                            status: "canceled",
                                            updatedAt: new Date()
                                        }
                                    }
                                )

                                allCar.updateOne(
                                    { _id: result.carId },
                                    {
                                        $inc: { bookingCount: -1 },
                                        $set: { availability: true }
                                    }
                                )

                                return res.json(bookingResult)
                            }

                            return res.json({ message: "cannot cancel confirmed booking after pickup date !" })
                        }
                    }
                    else if (req.body.pickupDate && req.body.dropoffDate) {

                        const pick = new Date(req.body.pickupDate)
                        const drop = new Date(req.body.dropoffDate)

                        const pickDate = new Date(`${pick.getFullYear()}-${pick.getMonth() + 1}-${pick.getDate()}`);
                        const dropDate = new Date(`${drop.getFullYear()}-${drop.getMonth() + 1}-${drop.getDate()}`);

                        if (req.body.pickupDate && !req.body.dropoffDate || !req.body.pickupDate && req.body.dropoffDate) {

                            return res.json({ error: "both pickup date & dropoff date is required" })
                        }

                        if (pickDate.toISOString() === result.pickupDate.toISOString() && dropDate.toISOString() === result.dropoffDate.toISOString()) {
                            return res.json({ error: "plz submit new dates" })
                        }

                        if (result.status === "pending") {

                            const carSchedules = await allBooking.find(
                                {
                                    _id: { $ne: id },
                                    carId: result.carId,
                                    status: { $nin: ["canceled", "completed"] }
                                },
                                {
                                    projection: {
                                        _id: false,
                                        pickupDate: true,
                                        dropoffDate: true
                                    }
                                }
                            ).toArray()

                            // pickup date & dropoff date validation
                            for (let i = 0; i < carSchedules.length; i++) {

                                let curPickDate = new Date(carSchedules[i].pickupDate)
                                let curDropDate = new Date(carSchedules[i].dropoffDate)

                                if ((pickDate.getTime() <= curDropDate.getTime() && pickDate.getTime() >= curPickDate.getTime())) {
                                    return res.json({ error: `this car is already scheduled on ${pickDate.toDateString()} by someone` })
                                }
                                else if ((dropDate.getTime() >= curPickDate.getTime() && dropDate.getTime() <= curDropDate.getTime())) {
                                    return res.json({ error: `this car is already scheduled on ${dropDate.toDateString()} by someone` })
                                }
                                else if ((curPickDate.getTime() <= dropDate.getTime() && curPickDate.getTime() >= pickDate.getTime())) {
                                    return res.json({ error: `picked date range is overlapping with an booked schedule` })
                                }

                            }

                            const oneDay = 24 * 60 * 60 * 1000;
                            const diffDays = Math.round(Math.abs((pickDate - dropDate) / oneDay));

                            let discount = 0;
                            let totalPrice = 0;

                            if (car.offerData) {

                                const { discountedCarId, discountPercentage, validUntil, minRentalDays, maxRentalDays } = car.offerData;

                                if (discountedCarId.toString() === result.carId.toString()) {

                                    if (Date.now() <= new Date(validUntil)) {

                                        if (minRentalDays && maxRentalDays) {

                                            if (diffDays >= minRentalDays && diffDays <= maxRentalDays) {
                                                discount = discountPercentage
                                            }
                                        }
                                        else if (!minRentalDays && maxRentalDays) {

                                            if (diffDays <= maxRentalDays) {
                                                discount = discountPercentage
                                            }
                                        }
                                        else if (minRentalDays && !maxRentalDays) {

                                            if (diffDays >= minRentalDays) {
                                                discount = discountPercentage
                                            }
                                        }
                                        else {

                                            discount = discountPercentage
                                        }
                                    }
                                    else {
                                        return res.json({ error: "offer expired, plz resubmit" })
                                    }
                                }
                                else {
                                    return res.json({ error: "how is this possible" })
                                }

                            }

                            if (discount) {

                                let discountedPrice = car.dailyPrice * (discount / 100);
                                let discountedDaily = car.dailyPrice - discountedPrice.toFixed(2)
                                totalPrice = Math.round(discountedDaily * diffDays)
                            }
                            else {
                                totalPrice = car.dailyPrice * diffDays;
                            }

                            const result2 = await allBooking.updateOne(
                                { _id: id },
                                {
                                    $set: {
                                        ...req.body,
                                        pickupDate: pickDate,
                                        dropoffDate: dropDate,
                                        totalPrice: totalPrice,
                                        updatedAt: new Date()
                                    }
                                }
                            )

                            return res.json(result2)
                        }
                    }

                }
                else if (result.ownerId.toString() === req.user.id) {

                    if (req.body.status === "canceled") {

                        if (result.status === "pending") {

                            const bookingResult = await allBooking.updateOne(
                                { _id: id },
                                {
                                    $set: {
                                        status: "canceled",
                                        updatedAt: new Date()
                                    }
                                }
                            )

                            allCar.updateOne(
                                { _id: result.carId },
                                { $inc: { bookingCount: -1 } }
                            )

                            return res.json(bookingResult)
                        }
                        else if (result.status === "confirmed") {

                            const date = new Date();
                            const curDate = new Date(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`)

                            if (curDate < result.pickupDate) {

                                const bookingResult = await allBooking.updateOne(
                                    { _id: id },
                                    {
                                        $set: {
                                            status: "canceled",
                                            updatedAt: new Date()
                                        }
                                    }
                                )

                                allCar.updateOne(
                                    { _id: result.carId },
                                    {
                                        $inc: { bookingCount: -1 },
                                        $set: { availability: true }
                                    }
                                )

                                return res.json(bookingResult)
                            }

                            return res.json({ message: "cannot cancel confirmed rental after pickup date" })
                        }
                    }
                    else if (req.body.status === "confirmed") {

                        if (result.status === "pending") {

                            const bookingResult = await allBooking.updateOne(
                                { _id: id },
                                {
                                    $set: {
                                        status: "confirmed",
                                        updatedAt: new Date()
                                    }
                                }
                            )

                            await allCar.updateOne(
                                { _id: result.carId },
                                {
                                    $set: { availability: false }
                                }
                            )

                            return res.json(bookingResult)
                        }

                        return res.json({ message: "status update failed" })
                    }
                    else if (req.body.status === "completed") {

                        if (result.status === "confirmed") {

                            const bookingResult = await allBooking.updateOne(
                                { _id: id },
                                {
                                    $set: {
                                        status: "completed",
                                        updatedAt: new Date()
                                    }
                                }
                            )

                            await allCar.updateOne(
                                { _id: result.carId },
                                {
                                    $set: { availability: true }
                                }
                            )
                            return res.json(bookingResult)
                        }

                        return res.json({ message: "status update failed" })
                    }
                }

                res.json({ message: "update failed !" })
            }
            catch (err) {
                res.json({ error: err.message })
            }
        })

        app.patch("/special-offer/:id", verifyToken, async (req, res) => {

            try {

                const id = new ObjectId(req.params.id)
                delete req.body.discountedCarId
                delete req.body.ownerId

                const offer = await allOffer.findOne(
                    { _id: id },
                    {
                        projection: {
                            discountedCarId: true,
                            ownerId: true
                        }
                    }
                )

                if (offer === null) {

                    return res.json({ error: "offer doesn't exist" })
                }

                if (offer.ownerId.toString() === req.user.id) {

                    const car = await allCar.findOne(
                        { _id: offer.discountedCarId },
                        { projection: { ownerId: true } }
                    )

                    if (car === null) {

                        return res.json({ error: "car doesn't exist" })
                    }

                    if (car.ownerId.toString() === req.user.id) {

                        const offerUpdates = await allOffer.updateOne(
                            { _id: id },
                            {
                                $set: {
                                    ...req.body,
                                    updatedAt: new Date()
                                }
                            }
                        )

                        return res.json(offerUpdates)
                    }

                    return res.json({ error: "can't update offer of someone else's car" })
                }

                res.json({ error: "cannot update someone else post" })
            }
            catch (err) {
                return res.json({ error: err.message })
            }
        })


        // DELETE
        app.delete("/jwt", async (req, res) => {

            res.clearCookie("token", {
                httpOnly: true,
                secure: true,
                sameSite: 'none'
            })
            res.clearCookie("role", {
                secure: true,
                sameSite: 'none'
            })
            res.clearCookie("location", {
                secure: true,
                sameSite: 'none'
            })
            res.json({ message: "cookie cleared", timestamp: Date.now() })
        })

        app.delete("/car/:id", verifyToken, async (req, res) => {

            try {
                const id = new ObjectId(req.params.id)
                const deletingDoc = await allCar.findOne(
                    { _id: id },
                    { projection: { ownerId: true } }
                )

                if (deletingDoc === null) {
                    return res.json({ error: "car not found" })
                }

                if (deletingDoc?.ownerId.toString() === req.user.id) {

                    allBooking.updateMany(
                        {
                            carId: id,
                            status: "pending"
                        },
                        {
                            $set: {
                                status: "canceled",
                                updatedAt: new Date()
                            }
                        }
                    )

                    const result = await allCar.deleteOne({ _id: id })
                    allOffer.deleteOne({ discountedCarId: id })

                    res.json(result);
                }
                else {
                    res.json({ error: "not your car !" })
                }
            }
            catch (err) {
                res.json({ error: err.message })
            }

        })

        app.delete("/special-offer/:id", verifyToken, async (req, res) => {

            try {
                const id = new ObjectId(req.params.id);

                const offer = await allOffer.findOne({ _id: id });

                if (offer === null) {
                    return res.json({ error: "offer doesn't exist" })
                }

                if (offer.ownerId.toString() !== req.user.id) {
                    return res.json({ error: "can't delete someone else offer" })
                }

                const result = await allOffer.deleteOne(
                    { _id: id }
                )

                res.json(result)
            }
            catch (err) {
                res.json({ error: err.message })
            }
        })

    } finally {

        console.log("Started finally")
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`server is running on http://localhost:${port}/`)
})