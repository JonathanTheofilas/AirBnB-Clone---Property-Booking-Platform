# AirBnB Clone - Property Booking Platform

A full-stack web application that replicates core AirBnB functionality, allowing users to search, filter, and book vacation rental properties.

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-563D7C?style=for-the-badge&logo=bootstrap&logoColor=white)

## 🎯 Features

- **Property Search & Filtering**: Search properties by location, price range, property type, bedrooms, and guest capacity
- **Advanced Booking System**: Complete booking flow with date validation and availability checking
- **Responsive Design**: Mobile-first design using Bootstrap 5
- **Real-time Price Calculation**: Dynamic pricing with deposit and balance calculations
- **Review Integration**: Display guest reviews and ratings
- **Database Integration**: Full CRUD operations with MongoDB

## 🚀 Demo

### Homepage - Property Search
- Advanced search filters (location, price, dates, guests)
- Grid layout with property cards
- Real-time availability status

### Booking System
- Detailed property information
- Date selection with validation
- Guest information form
- Price breakdown and confirmation

### Responsive Design
- Mobile-optimized interface
- Smooth animations and hover effects
- Modern AirBnB-inspired UI

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with MongoDB Atlas
- **Frontend**: HTML5, CSS3, Bootstrap 5, JavaScript
- **Icons**: Font Awesome
- **Development**: Nodemon for hot reloading

## 📦 Installation

### Prerequisites
- Node.js (v16.0.0 or higher)
- MongoDB Atlas account (or local MongoDB installation)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/airbnb-clone.git
   cd airbnb-clone
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   
   Create a `.env` file in the root directory:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   PORT=3000
   NODE_ENV=development
   ```

4. **Database Setup**
   - Create a MongoDB Atlas cluster (or use local MongoDB)
   - Import the sample AirBnB dataset
   - Update your connection string in the `.env` file

5. **Run the application**
   
   Development mode:
   ```bash
   npm run dev
   ```
   
   Production mode:
   ```bash
   npm start
   ```

6. **Access the application**
   
   Open your browser and navigate to: `http://localhost:3000`

## 📁 Project Structure

```
airbnb-clone/
├── server.js             # Main application server
├── package.json          # Dependencies and scripts
├── package-lock.json     # Dependency lock file
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore rules
└── README.md             # Project documentation
```

## 🎨 Key Features Breakdown

### Search & Filtering
- **Location-based search**: Mandatory location selection
- **Price range filtering**: Min/max price inputs
- **Date availability**: Check-in/check-out date validation
- **Property specifications**: Bedrooms, guest capacity, property type

### Booking Flow
- **Property details**: Comprehensive property information
- **Availability checking**: Real-time booking conflict detection
- **Guest information**: Complete user registration form
- **Payment calculation**: Automatic deposit and balance calculation
- **Confirmation system**: Booking reference generation

### Database Operations
- **Property management**: Read operations on listings collection
- **Booking management**: Create operations for new bookings
- **Client management**: User information storage
- **Review integration**: Display existing guest feedback

## 📱 Responsive Design

The application features a mobile-first responsive design:
- Flexible grid system using Bootstrap 5
- Touch-friendly interface elements
- Optimised images and loading states
- Smooth animations and transitions

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Homepage with property search |
| POST | `/search` | Filter properties based on criteria |
| GET | `/bookings` | Individual property booking page |
| POST | `/book` | Process booking submission |

## 🚀 Deployment

### Environment Variables
Ensure these environment variables are set in production:
- `MONGODB_URI`: Your MongoDB connection string
- `PORT`: Application port (default: 3000)
- `NODE_ENV`: Set to 'production'

### Recommended Platforms
- **Heroku**: Easy deployment with MongoDB Atlas
- **Vercel**: Serverless deployment option
- **Railway**: Simple Node.js deployment
- **DigitalOcean App Platform**: Container-based deployment

## 👤 Author

**Jonathan Theofilas**
- GitHub: [@JonathanTheofilas](https://github.com/JonathanTheofilas))
- LinkedIn: [Jonathan Theofilas](https://linkedin.com/in/yourprofile)

## 🙏 Acknowledgments

- Sample data provided by MongoDB Atlas sample datasets
- UI inspiration from AirBnB's design system
- Bootstrap team for the responsive framework
- Font Awesome for the icon library

---

⭐ **Star this repository if you found it helpful!**
