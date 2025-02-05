# VroomRents Backend
This repository contains the backend services for *VroomRents* website. The backend is built using Node.js, Express, and MongoDB to provide a secure and scalable server for managing car listings, user authentication, and real-time booking updates.

🚀 **Live Server URL:** [https://b10-a11-server-side-beryl.vercel.app/](https://b10-a11-server-side-beryl.vercel.app/)

## 🎯 Project Purpose
This backend service is designed to handle all data processing and API requests for VroomRents. It ensures secure user authentication, manages car inventory and bookings, and provides ~~real-time~~ updates on availability.

## 🌟 Key Features

### Core Functionalities
- **RESTful APIs:** For managing cars, users, and bookings.
- **JWT Authentication:** Secure private routes and verify user sessions.
- **MongoDB Integration:** Efficient data storage and retrieval.
- **Real-Time Updates:** Keep car availability and booking statuses current.
- **Environment Variables:** Secure sensitive data like JWT and MongoDB credentials.
- **Pagination & Sorting:** For listing and searching cars.

### API Endpoints

1. AUTH APIs

    ```
    - (POST)    /user             (add user)
    - (GET )    /user/:email      (get token)
    - (PATCH)   /user             (update user + get token)
    - (DELETE)  /jwt              (delete token)
    ```

2. CAR APIs

    ```
    - (GET )    /my-cars     (get cars)
    - (POST)    /car         (add car)
    - (GET )    /car/:id     (get car details)
    - (PATCH)   /car/:id     (update car)
    - (DELETE)  /car/:id     (delete car)
    ```

3. BOOKING/RENT APIs

    ```
    - (GET )    /booking-schedules/:id (get car schedules)
    - (GET )    /my-bookings           (get all booking)
    - (GET )    /my-rentals            (get all rental)
    - (POST)    /booking               (add booking)
    - (PATCH)   /booking/:id           (update booking)
    ```

4. OFFER APIs

    ```
    - (POST)     /special-offers     (add offer) 
    - (PATCH)    /special-offers/:id (update offer)
    - (DELETE)   /special-offers/:id (delete offer)
    ```

5. HOME PAGE APIs

    ```
    - (GET )    /available-cars    (get all available cars)
    - (GET )    /recent-listings   (get 50 recent added cars)
    - (GET )    /special-offers    (get 50 car offer)
    ```

## 🛠️ Technology Stack

### Core Libraries

- **Node.js:** JavaScript runtime for the server.
- **Express.js:** Web framework for building APIs.
- **MongoDB:** Database for storing car and booking data.
- **JWT:** Secure authentication and session management.

### Additional Libraries

- **dotenv:** Manage environment variables.
- **cors:** Handle Cross-Origin Resource Sharing.


### 📝 Setup Instructions

1. Clone the repository:

    ```bash
    git clone https://github.com/mes-shahadat/B10A11-server-side.git
    cd B10A11-server-side
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Create a .env file in the root directory :

    ```ini
    PORT=3000
    DB_URI=your-mongodb-connection-string
    JWT_SECRET=any-strong-password
    ```

4. Start the server:

    ```bash
    npm run start
    ```

**Note:** This git repo is corrupted, so run `git reset --hard 0f3b805` if you want to run git checkout command