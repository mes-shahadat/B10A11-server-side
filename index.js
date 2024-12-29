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

            const id = new ObjectId(req.params.id)
            const result = await allCar.findOne(
                { _id: id }
            )

            res.json({ result })
        })

        app.get("/booking-schedules/:id", verifyToken, async (req, res) => {

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
                
                const pickDate = new Date(data.pickupDate);
                const dropDate = new Date(data.dropoffDate);

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
                        return res.json({ error: `this car is already scheduled on ${data.pickupDate.toDateString()} by someone` })
                    }
                    else if ((dropDate.getTime() >= curPickDate.getTime() && dropDate.getTime() <= curDropDate.getTime())) {
                        return res.json({ error: `this car is already scheduled on ${data.dropoffDate.toDateString()} by someone` })
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

                const { dailyPrice, ownerId } = await allCar.findOne(
                    { _id: data.carId },
                    {
                        projection: {
                            _id: false,
                            dailyPrice: true,
                            ownerId: true
                        }
                    }
                )

                data.ownerId = new ObjectId(ownerId)
                data.totalPrice = dailyPrice * diffDays;

                if (req.user.id === ownerId.toString()) {
                    return res.json({ error: "renting own cars are not allowed !" })
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

        // PATCH
        app.patch("/user", verifyToken, async(req, res) => {
            
            let user = await allUser.updateOne(
                { _id: new ObjectId(req.user.id) },
                {
                    $set : {
                        ...req.body
                    }
                }
            )

            res.json({user})
        })

        app.patch("/car/:id", verifyToken, async (req, res) => {

            try {

                delete req.body?.bookingCount

                const id = new ObjectId(req.params.id)
                const updatingDoc = await allCar.findOne(
                    { _id: id },
                    { projection: { ownerId: true } }
                )

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
                    res.json({ error: "post not found" })
                }
            }
            catch (err) {
                res.json({ error: err.message })
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

                if (deletingDoc?.ownerId.toString() === req.user.id) {

                    const result = await allCar.deleteOne({ _id: id })

                    res.json(result);
                }
                else {
                    res.json({ error: "post not found" })
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