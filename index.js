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

            const date = req.query.date === "desc" ? -1 : 1;
            const price = req.query.price === "desc" ? -1 : 1;

            const cursor = allCar.find(
                {
                    ownerId: new ObjectId(req.user.id)
                }
            ).sort(
                {
                    dailyPrice: price,
                    createdAt: date
                }
            ).project(
                {
                    ownerId: false,
                    bookingCount: false,
                    updatedAt: false
                }
            )

            const result = await cursor.toArray()

            res.json(result)
        })

        // POST
        app.post('/user', async (req, res) => {

            const doc = req.body;

            const result = await allUser.insertOne(doc);

            res.json(result)
        })

        app.post("/car", verifyToken, async (req, res) => {

            const doc = req.body
            const date = new Date()
            doc.ownerId = new ObjectId(req.user.id);
            doc.createdAt = date.toISOString()
            doc.updatedAt = date.toISOString()

            const result = await allCar.insertOne(doc);

            res.json(result)

        })


        // PATCH
        app.patch("/car/:id", verifyToken, async (req, res) => {

            try {
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
                    res.json({ error: "not your post" })
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

    } finally {

        console.log("finally")
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})