const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
var cookieParser = require('cookie-parser')
var cors = require('cors')
var jwt = require('jsonwebtoken');
require('dotenv').config()
const app = express()
const port = process.env.PORT || 5000;

app.use(cors())
app.use(cookieParser())
app.use(express.json())

const verifyToken = (req, res, next) => {

    if (req.cookies.token) {

        const token = req.cookies.token;

        jwt.verify(token, jwtSecret, (err, token) => {

            if (err) {

                res.clearCookie("token")
                res.status(401).json({ error: "token is invalid" })
            }
            else {
                req.user = token
                next()
            }
        });

    }
    else {
        res.status(401).json({ error: "token not found" })
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

        try {
            const indexes = await allOffer.indexes();
            const ttlIndex = indexes.find(
                index => index.key.validUntil === 1 && index.expireAfterSeconds === 0
            );

            if (!ttlIndex) {

                console.log("Creating TTL index...");
                await allOffer.createIndex({ validUntil: 1 }, { expireAfterSeconds: 0 });
            } else {
                console.log("TTL index already exists");
            }
        }
        catch (err) { console.log(err.message) }

        try {

            const changeStream = allOffer.watch(
                [
                    { $match: { operationType: 'delete' } }
                ]
            );

            console.log('Watching for TTL deletions...');

            changeStream.on('change', async (change) => {

                await allCar.updateOne(
                    { discountId: change.documentKey._id },
                    {
                        $unset: {
                            discountId: 1,
                            discount: 1
                        }
                    }
                )
            });

        } catch (err) {
            console.error('Error:', err.message);
        }

        // GET
        app.get('/', (req, res) => {

            res.send('car rental server is running...')
        })

        app.get('/user/:email', async (req, res) => {

            const email = req.params.email.split("&")[0];
            const password = req.params.email.split("&")[1];

            const result = await allUser.findOne({ email: email });

            result.password === undefined ? result.password = "🔒" : null

            if (result && password === result.password) {

                const token = jwt.sign({ id: result?._id, email: result?.email }, jwtSecret);

                res.cookie("token", token, {
                    httpOnly: true
                })

                res.json({ message: "user found" })
            }
            else {
                res.clearCookie("token")
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

                const cursor = allCar.find(
                    {
                        ownerId: new ObjectId(req.user.id)
                    }
                )
                    .sort(
                        {
                            dailyPrice: price,
                            createdAt: date
                        }
                    )
                    .limit(limit)
                    .skip(limit * page)
                    .project(
                        {
                            ownerId: false,
                            bookingCount: false,
                            updatedAt: false
                        }
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
                else {
                    obj.availability = true;
                }

                const cursor = allCar.find(obj)
                    .sort(
                        {
                            dailyPrice: price,
                            createdAt: date
                        }
                    )
                    .limit(limit)
                    .skip(limit * page)
                    .project(
                        {
                            ownerId: false,
                            updatedAt: false
                        }
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
                const result = await allCar.findOne(
                    { _id: id }
                )

                res.json({ result })
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
                            _id: false,
                            pickupDate: true,
                            dropoffDate: true
                        }
                    }
                ).toArray()

                res.json({ result })
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
                        $project: {
                            pickupDate: true,
                            dropoffDate: true,
                            status: true,
                            totalPrice: true,
                            createdAt: true,
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
                        $project: {
                            pickupDate: true,
                            dropoffDate: true,
                            status: true,
                            totalPrice: true,
                            createdAt: true,
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

        // POST
        app.post('/user', async (req, res) => {

            const doc = req.body;
            let insertResult = { message: "user found" };

            let user = await allUser.findOne(
                { email: { $regex: req.body.email, $options: "i" } }
            )

            if (!user) {
                const result = await allUser.insertOne(doc);
                user = doc;
                insertResult = result
            }
            else if (!doc.login) {
                return res.json({ error: "email already exists !" })
            }

            if (doc.login) {

                const token = jwt.sign({ id: user?._id, email: user?.email }, jwtSecret);

                res.cookie("token", token, {
                    httpOnly: true
                })

            }

            res.json({ ...insertResult })
        })

        app.post("/car", verifyToken, async (req, res) => {

            try {
                const doc = req.body
                doc.ownerId = new ObjectId(req.user.id);
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

                const bookCar = await allCar.findOne(
                    { _id: data.carId },
                    {
                        projection: {
                            _id: false,
                            dailyPrice: true,
                            ownerId: true,
                            discountId: true,
                            discount: true
                        }
                    }
                )

                if (bookCar === null) {
                    return res.json({ error: "car doesn't exists !" })
                }

                data.ownerId = new ObjectId(bookCar.ownerId)

                if (req.user.id === bookCar.ownerId.toString()) {
                    return res.json({ error: "renting own cars are not allowed !" })
                }


                let discount = 0;

                if (bookCar.discountId) {

                    const result = await allOffer.findOne(
                        { _id: bookCar.discountId },
                        {
                            projection: {
                                discountedCarId: true,
                                discountPercentage: true,
                                validUntil: true,
                                minRentalDays: true,
                                maxRentalDays: true
                            }
                        }
                    )

                    if (result) {

                        const { discountedCarId, discountPercentage, validUntil, minRentalDays, maxRentalDays } = result;

                        if (discountedCarId.toString() === data.carId.toString()) {

                            if (Date.now() <= validUntil) {

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
                                return res.json({ error: "offer expired" })
                            }
                        }
                        else {
                            return res.json({ error: "how is this possible" })
                        }

                    }
                    else {
                        return res.json({ error: "offer expired !" })
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

                res.json({ result })
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

                    const result = await allOffer.insertOne(data)

                    await allCar.updateOne(
                        { _id: data.discountedCarId },
                        {
                            $set: {
                                discountId: result.insertedId,
                                discount: parseInt(data.discountPercentage)
                            }
                        }
                    )

                    return res.json(result)
                }

                return res.json({ error: "offer already exist for this car" })
            }

            res.json({ error: "can't add offer to someone's car" })
        })

        // PATCH
        app.patch("/user", verifyToken, async (req, res) => {

            try {
                let user = await allUser.updateOne(
                    { _id: new ObjectId(req.user.id) },
                    {
                        $set: {
                            ...req.body
                        }
                    }
                )

                res.json({ user })
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
                    return res.json({ error: "post not found" })
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
                    res.json({ error: "not your post" })
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

                if (result.userId.toString() === req.user.id) {

                    if (req.body.status === "canceled") {

                        if (result.status === "pending") {

                            const result = await allBooking.updateOne(
                                { _id: id },
                                {
                                    $set: {
                                        status: "canceled",
                                        updatedAt: new Date()
                                    }
                                }
                            )

                            return res.json(result)
                        }
                        else if (result.status !== "canceled") {

                            const date = new Date();
                            const curDate = new Date(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`)

                            if (curDate < result.pickupDate) {

                                const result = await allBooking.updateOne(
                                    { _id: id },
                                    {
                                        $set: {
                                            status: "canceled",
                                            updatedAt: new Date()
                                        }
                                    }
                                )

                                return res.json(result)
                            }

                            return res.json({ message: "cannot cancel confirmed boking after pickup date" })
                        }
                    }
                    else if (req.body.pickupDate && req.body.dropoffDate) {

                        const pick = new Date(req.body.pickupDate)
                        const drop = new Date(req.body.dropoffDate)

                        const pickDate = new Date(`${pick.getFullYear()}-${pick.getMonth() + 1}-${pick.getDate()}`);
                        const dropDate = new Date(`${drop.getFullYear()}-${drop.getMonth() + 1}-${drop.getDate()}`);

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

                            const result2 = await allBooking.updateOne(
                                { _id: id },
                                {
                                    $set: {
                                        pickupDate: pickDate,
                                        dropoffDate: dropDate
                                    }
                                }
                            )

                            return res.json(result2)
                        }
                    }
                    else if (req.body.pickupDate && !req.body.dropoffDate || !req.body.pickupDate && req.body.dropoffDate) {

                        return res.json({ error: "both pickup date & dropoff date is required" })
                    }
                }
                else if (result.ownerId.toString() === req.user.id) {

                    if (req.body.status === "canceled") {

                        if (result.status === "pending") {

                            const result = await allBooking.updateOne(
                                { _id: id },
                                {
                                    $set: {
                                        status: "canceled",
                                        updatedAt: new Date()
                                    }
                                }
                            )

                            return res.json(result)
                        }
                        else if (result.status === "confirmed") {

                            const date = new Date();
                            const curDate = new Date(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`)

                            if (curDate < result.pickupDate) {

                                const result = await allBooking.updateOne(
                                    { _id: id },
                                    {
                                        $set: {
                                            status: "canceled",
                                            updatedAt: new Date()
                                        }
                                    }
                                )

                                return res.json(result)
                            }

                            return res.json({ message: "cannot cancel confirmed rental after pickup date" })
                        }
                    }
                    else if (req.body.status === "confirmed") {

                        if (result.status === "pending") {

                            const result = await allBooking.updateOne(
                                { _id: id },
                                {
                                    $set: {
                                        status: "confirmed",
                                        updatedAt: new Date()
                                    }
                                }
                            )

                            return res.json(result)
                        }

                        return res.json({ message: "status update failed" })
                    }
                    else if (req.body.status === "completed") {

                        if (result.status === "confirmed") {

                            const result = await allBooking.updateOne(
                                { _id: id },
                                {
                                    $set: {
                                        status: "completed",
                                        updatedAt: new Date()
                                    }
                                }
                            )

                            return res.json(result)
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
                                    ...req.body
                                }
                            }
                        )

                        if (req.body.discountPercentage) {

                            allCar.updateOne(
                                { _id: offer.discountedCarId },
                                {
                                    $set: {
                                        discount: parseInt(req.body.discountPercentage)
                                    }
                                }
                            )

                        }

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

            res.clearCookie("token")
            res.json({ message: "cookie cleared" })
        })

        app.delete("/car/:id", verifyToken, async (req, res) => {

            try {
                const id = new ObjectId(req.params.id)
                const deletingDoc = await allCar.findOne(
                    { _id: id },
                    { projection: { ownerId: true } }
                )

                if (deletingDoc === null) {
                    return res.json({ error: "post not found" })
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
                    await allOffer.deleteOne({ discountedCarId: id })

                    res.json(result);
                }
                else {
                    res.json({ error: "not your post" })
                }
            }
            catch (err) {
                res.json({ error: err.message })
            }

        })

    } finally {

        console.log("finally")
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})