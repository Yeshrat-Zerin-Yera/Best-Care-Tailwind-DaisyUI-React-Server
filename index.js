const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, Collection } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.3drcjwz.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// Function
async function run() {
    try {
        // Database & Collections
        const appointmentOptionCollection = client.db('BestCareDatabase').collection('AppointmentOptions');
        const bookingCollection = client.db('BestCareDatabase').collection('Bookings');
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
        app.get('/bookings', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings);
        });

    }
    finally { }
}
run().catch(console.dir);

// Testing
app.get('/', async (req, res) => res.send('Best Care Server Running'));
app.listen(port, () => console.log(`Best Care Server Running On Port: ${port}`));