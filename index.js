const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, Collection, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { query } = require('express');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.3drcjwz.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// Varify JWT Function
function varifyJWT(req, res, next) {
    console.log(req.headers.authorization);
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('Unauthorized Access');
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' });
        }
        req.decoded = decoded;
        next();
    });
};

// Run Function
async function run() {
    try {
        // Database & Collections
        const appointmentOptionCollection = client.db('BestCareDatabase').collection('AppointmentOptions');
        const bookingCollection = client.db('BestCareDatabase').collection('Bookings');
        const userCollection = client.db('BestCareDatabase').collection('Users');
        const doctorCollection = client.db('BestCareDatabase').collection('Doctors');
        const paymentCollection = client.db('BestCareDatabase').collection('Payments');
        const varifyAdmin = async (req, rex, next) => {
            const decodedEmail = req.decoded.email;
            const filter = { email: decodedEmail };
            const user = await userCollection.findOne(filter);
            if (user?.role !== 'Admin') {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            next();
        };
        // 🌼Appointment Options
        // 🍒Get Appointment Options From Database
        app.get('/appointmentOptions', async (req, res) => {
            const query = {};
            const appointmentOptions = await appointmentOptionCollection.find(query).toArray();
            // Get Bookings By Date
            const date = req.query.date;
            const bookingQuery = { appointmentDate: date };
            const bookingsByDate = await bookingCollection.find(bookingQuery).toArray();
            // ✂️Appointment Options & Bookings
            // Loop Through Appointment Options Name & Match With Booking's Treatment 
            appointmentOptions.forEach(appointmentOption => {
                const bookingsByTreatment = bookingsByDate.filter(booking => booking.treatment === appointmentOption.name);
                // Booked Slots Of Each Appointment Option
                const bookedSlots = bookingsByTreatment.map(booking => booking.slot);
                const remainingSlots = appointmentOption.slots.filter(slot => !bookedSlots.includes(slot));
                appointmentOption.slots = remainingSlots;
                console.log(date, appointmentOption.name, remainingSlots.length);
                console.log(appointmentOption.slots);
            })
            // Sending Appointment Options To Database
            res.send(appointmentOptions);
        });
        // 🍒Get Appointment Option's Names From Database
        app.get('/doctorspecialties', async (req, res) => {
            const query = {};
            const result = await appointmentOptionCollection.find(query).project({ name: 1 }).toArray();
            res.send(result);
        });
        // 🌼Bookings
        // 🍒Post Bookings To Database
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            // ✂️ Bookings Query By Same Date Email & Treatment
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            }
            const alreadyBooked = await bookingCollection.find(query).toArray();
            if (alreadyBooked.length) {
                const message = `You Already Have An Appointment On  ${booking.appointmentDate} For ${booking.treatment}`;
                return res.send({ acknowledged: false, message });
            }
            // Post Bookings To Database
            const result = await bookingCollection.insertOne(booking);
            res.send(result);
        });
        // 🍒Get Booking By Email
        app.get('/bookings', varifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const query = { email: email };
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings);
        });
        // 🍒Get Booking By Id
        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        });
        // 🌼Users
        // 🍒Post Users To Database
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user?.email };
            const signUpUsers = await userCollection.find(query).toArray();
            if (signUpUsers.length) {
                return res.send({ acknowledged: false });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });
        // 🍒Get Users From Database
        app.get('/users', async (req, res) => {
            const query = {};
            const options = {
                sort: { role: 1 }
            };
            const users = await userCollection.find(query, options).toArray();
            res.send(users);
        });
        // 🍒Get Users From Database
        app.put('/users/admin/:id', varifyJWT, varifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const user = await userCollection.findOne(filter);
            if (user?.role === 'Admin') {
                const updateDoc = {
                    $set: {
                        role: 'User'
                    }
                };
                const result = await userCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            }
            else {
                const updateDoc = {
                    $set: {
                        role: 'Admin'
                    }
                };
                const result = await userCollection.updateOne(filter, updateDoc, options);
                res.send(result);
            }
        });
        // 🍒Get Users By Email From Database
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'Admin' });
        });
        // 🌼Doctor
        // 🍒Post Doctor To Database
        app.post('/doctors', varifyJWT, varifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(doctor);
        });
        // 🍒Get Doctors To Database
        app.get('/doctors', varifyJWT, varifyAdmin, async (req, res) => {
            const query = {};
            const doctors = await doctorCollection.find(query).toArray();
            res.send(doctors);
        });
        // 🍒Delete A Doctor By Id From Database
        app.delete('/doctors/:id', varifyJWT, varifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await doctorCollection.deleteOne(query);
            res.send(result);
        });
        // 🌼Update Price
        // 🍒Update Price In Appointment Options
        // app.get('/addprice', async (req, res) => {
        //     const filter = {};
        //     const options = { upsert: true };
        //     const updateDoc = {
        //         $set: {
        //             price: 200
        //         }
        //     }
        //     const result = await appointmentOptionCollection.updateMany(filter, updateDoc, options);
        //     res.send(result);
        // });
        // 🌼Payment
        // 🍒Create Payment Intent
        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking?.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });
        // 🍒Post Payment To Database
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);
            const bookingId = payment?.bookingId;
            const filter = { _id: ObjectId(bookingId) };
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment?.transactionId
                }
            }
            const updatedResult = await bookingCollection.updateOne(filter, updateDoc);
            res.send(result);
        });
        // 🌼JWT
        // 🍒Get Users & Send JWT Token
        // node > require('crypto').randomBytes(64).toString('hex')
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            console.log(user);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' });
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' });
        });
    }
    finally { }
}
run().catch(console.dir);

// Testing
app.get('/', async (req, res) => res.send('Best Care Server Running'));
app.listen(port, () => console.log(`Best Care Server Running On Port: ${port}`));