const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const bodyParser = require('body-parser');
require('dotenv').config(); // Add this to load environment variables

const app = express();
const port = process.env.PORT || 3000;

// MongoDB connection URI - now uses environment variable
const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/airbnb_clone";
const client = new MongoClient(uri);

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
async function connectDB() {
    try {
        await client.connect();
        console.log("Connected to MongoDB successfully");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1); // Exit if cannot connect to database
    }
}

// Homepage route - serve the main search form and display listings
app.get('/', async (req, res) => {
    try {
        const database = client.db('sample_airbnb');
        const listings = database.collection('listingsAndReviews');
        
        // Get some random listings for initial display (limit to 10)
        const randomListings = await listings.aggregate([
            { $match: { 
                "address.market": { $exists: true },
                "review_scores.review_scores_rating": { $exists: true },
                "price": { $exists: true }
            }},
            { $sample: { size: 10 } },
            { $project: {
                _id: 1,
                name: 1,
                summary: 1,
                price: 1,
                "review_scores.review_scores_rating": 1,
                "address.market": 1,
                property_type: 1,
                bedrooms: 1,
                accommodates: 1,
                images: 1,
                reviews: { $slice: ["$reviews", 3] }, // Get first 3 reviews
                bookings: 1
            }}
        ]).toArray();

        // Get unique markets for dropdown
        const markets = await listings.distinct("address.market", {
            "address.market": { $exists: true, $ne: null }
        });

        // Get unique property types for dropdown
        const propertyTypes = await listings.distinct("property_type", {
            "property_type": { $exists: true, $ne: null }
        });

        res.send(generateHomepage(randomListings, markets.sort(), propertyTypes.sort()));
    } catch (error) {
        console.error("Error loading homepage:", error);
        res.status(500).send("Error loading homepage");
    }
});

// Search/filter route with enhanced filtering
app.post('/search', async (req, res) => {
    try {
        const { location, property_type, bedrooms, min_price, max_price, guests, check_in, check_out } = req.body;
        
        const database = client.db('sample_airbnb');
        const listings = database.collection('listingsAndReviews');
        
        // Build query based on form inputs
        let query = {
            "address.market": location, // Location is mandatory
            "review_scores.review_scores_rating": { $exists: true },
            "price": { $exists: true }
        };
        
        // Add optional filters
        if (property_type && property_type !== '') {
            query.property_type = property_type;
        }
        
        if (bedrooms && bedrooms !== '') {
            query.bedrooms = parseInt(bedrooms);
        }
        
        // Price range filtering
        if (min_price || max_price) {
            query.price = {};
            if (min_price) query.price.$gte = parseFloat(min_price);
            if (max_price) query.price.$lte = parseFloat(max_price);
        }
        
        // Guest capacity filtering
        if (guests && guests !== '') {
            query.accommodates = { $gte: parseInt(guests) };
        }
        
        let filteredListings = await listings.find(query)
            .project({
                _id: 1,
                name: 1,
                summary: 1,
                price: 1,
                "review_scores.review_scores_rating": 1,
                "address.market": 1,
                property_type: 1,
                bedrooms: 1,
                accommodates: 1,
                images: 1,
                reviews: { $slice: ["$reviews", 3] }, // Get first 3 reviews
                bookings: 1
            })
            .limit(20)
            .toArray();
        
        // Availability checking if dates provided
        if (check_in && check_out) {
            const checkInDate = new Date(check_in);
            const checkOutDate = new Date(check_out);
            
            filteredListings = filteredListings.filter(listing => {
                if (!listing.bookings || listing.bookings.length === 0) {
                    return true; // Available if no bookings
                }
                
                // Check for overlapping bookings
                const hasConflict = listing.bookings.some(booking => {
                    const arrivalDate = new Date(booking.arrival_date);
                    const departureDate = new Date(booking.departure_date);
                    
                    return (checkInDate < departureDate && checkOutDate > arrivalDate);
                });
                
                return !hasConflict; // Available if no conflicts
            });
        }

        // Get dropdowns for the form
        const markets = await listings.distinct("address.market", {
            "address.market": { $exists: true, $ne: null }
        });
        const propertyTypes = await listings.distinct("property_type", {
            "property_type": { $exists: true, $ne: null }
        });

        res.send(generateHomepage(filteredListings, markets.sort(), propertyTypes.sort(), {
            location, property_type, bedrooms, min_price, max_price, guests, check_in, check_out
        }));
    } catch (error) {
        console.error("Error filtering listings:", error);
        res.status(500).send("Error filtering listings");
    }
});

// Bookings page route with enhanced data
app.get('/bookings', async (req, res) => {
    try {
        const listingId = req.query.listing_id;
        
        if (!listingId) {
            return res.status(400).send("Listing ID is required");
        }
        
        const database = client.db('sample_airbnb');
        const listings = database.collection('listingsAndReviews');
        
        const listing = await listings.findOne(
            { _id: listingId },
            {
                projection: {
                    _id: 1,
                    name: 1,
                    summary: 1,
                    description: 1,
                    property_type: 1,
                    bedrooms: 1,
                    bathrooms: 1,
                    accommodates: 1,
                    price: 1,
                    cleaning_fee: 1,
                    images: 1,
                    amenities: 1,
                    "address.market": 1,
                    "review_scores.review_scores_rating": 1,
                    reviews: { $slice: ["$reviews", 5] }, // Get first 5 reviews
                    bookings: 1
                }
            }
        );
        
        if (!listing) {
            return res.status(404).send("Listing not found");
        }
        
        res.send(generateBookingPage(listing));
    } catch (error) {
        console.error("Error loading booking page:", error);
        res.status(500).send("Error loading booking page");
    }
});

// Process booking submission with enhancements
app.post('/book', async (req, res) => {
    try {
        const {
            listing_id,
            check_in,
            check_out,
            guest_count,
            client_name,
            email,
            daytime_phone,
            mobile_phone,
            postal_address,
            home_address,
            special_requirements
        } = req.body;
        
        const database = client.db('sample_airbnb');
        const listings = database.collection('listingsAndReviews');
        const clients = database.collection('clients');
        
        // First, get the listing to check availability and get pricing info
        const listing = await listings.findOne({ _id: listing_id });
        if (!listing) {
            return res.status(404).send("Listing not found");
        }
        
        const checkInDate = new Date(check_in);
        const checkOutDate = new Date(check_out);
        
        // Check for conflicting bookings
        if (listing.bookings && listing.bookings.length > 0) {
            const hasConflict = listing.bookings.some(booking => {
                const arrivalDate = new Date(booking.arrival_date);
                const departureDate = new Date(booking.departure_date);
                
                return (checkInDate < departureDate && checkOutDate > arrivalDate);
            });
            
            if (hasConflict) {
                return res.status(400).send(`
                    <div class="container mt-5">
                        <div class="alert alert-danger text-center">
                            <h3>Sorry, this property is not available for your selected dates.</h3>
                            <p>Please select different dates or choose another property.</p>
                            <a href="/" class="btn btn-primary">Back to Search</a>
                        </div>
                    </div>
                `);
            }
        }
        
        // Calculate total cost
        const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
        const totalCost = nights * (listing.price || 0);
        
        // Generate new IDs
        const bookingId = new ObjectId();
        const clientId = new ObjectId();
        
        // Create or update client record
        const clientData = {
            _id: clientId,
            name: client_name,
            email: email,
            daytime_phone_number: daytime_phone,
            mobile_number: mobile_phone,
            postal_address: postal_address,
            home_address: home_address,
            booking_history: [{
                booking_id: bookingId,
                listing_id: listing_id,
                arrival_date: checkInDate,
                departure_date: checkOutDate,
                total_cost: totalCost,
                guest_count: parseInt(guest_count),
                special_requirements: special_requirements,
                status: "confirmed"
            }]
        };
        
        await clients.insertOne(clientData);
        
        // Add booking to listing
        const bookingData = {
            booking_id: bookingId,
            client_id: clientId,
            arrival_date: checkInDate,
            departure_date: checkOutDate,
            deposit_paid: totalCost * 0.2, // 20% deposit
            balance_amount_due: totalCost * 0.8,
            balance_due_date: new Date(checkInDate.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days before
            num_guests: parseInt(guest_count),
            status: "confirmed",
            booking_date: new Date(),
            special_requirements: special_requirements,
            guest_list: [{
                name: client_name,
                age: null
            }]
        };
        
        await listings.updateOne(
            { _id: listing_id },
            { 
                $push: { bookings: bookingData }
            }
        );
        
        res.send(generateConfirmationPage(bookingId, client_name, listing.name, checkInDate, checkOutDate, totalCost));
    } catch (error) {
        console.error("Error processing booking:", error);
        res.status(500).send("Error processing booking: " + error.message);
    }
});

// Helper function to generate homepage HTML with enhancements
function generateHomepage(listings, markets, propertyTypes, selectedValues = {}) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AirBnB Property Search</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            :root {
                --airbnb-red: #ff5a5f;
                --airbnb-dark-red: #e74c3c;
                --airbnb-light-gray: #f7f7f7;
                --airbnb-dark-gray: #484848;
                --airbnb-green: #00a699;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: var(--airbnb-light-gray);
            }
            
            .brand-header {
                background: linear-gradient(135deg, var(--airbnb-red), var(--airbnb-dark-red));
                color: white;
                padding: 2rem 0;
                margin-bottom: 2rem;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            
            .brand-logo {
                font-size: 2.5rem;
                font-weight: bold;
                text-decoration: none;
                color: white;
            }
            
            .brand-logo:hover {
                color: white;
                text-decoration: none;
            }
            
            .search-form {
                background: white;
                border-radius: 15px;
                box-shadow: 0 8px 25px rgba(0,0,0,0.1);
                transition: transform 0.3s ease;
            }
            
            .search-form:hover {
                transform: translateY(-2px);
            }
            
            .listing-card {
                background: white;
                border-radius: 15px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                transition: all 0.3s ease;
                margin-bottom: 25px;
                height: 100%;
            }
            
            .listing-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            }
            
            .property-image {
                width: 100%;
                height: 200px;
                object-fit: cover;
                transition: transform 0.3s ease;
            }
            
            .listing-card:hover .property-image {
                transform: scale(1.05);
            }
            
            .listing-title {
                color: var(--airbnb-dark-gray);
                text-decoration: none;
                font-weight: 600;
                font-size: 1.1rem;
                display: block;
                margin-bottom: 0.5rem;
            }
            
            .listing-title:hover {
                color: var(--airbnb-red);
                text-decoration: none;
            }
            
            .price {
                font-size: 1.3rem;
                font-weight: bold;
                color: var(--airbnb-green);
            }
            
            .rating {
                background: var(--airbnb-red);
                color: white;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 0.9rem;
                font-weight: 500;
            }
            
            .availability-badge {
                background: var(--airbnb-green);
                color: white;
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 0.8rem;
                position: absolute;
                top: 10px;
                right: 10px;
            }
            
            .review-snippet {
                background: var(--airbnb-light-gray);
                border-radius: 8px;
                padding: 8px;
                margin-top: 8px;
                font-size: 0.85rem;
                font-style: italic;
            }
            
            .btn-primary {
                background: var(--airbnb-red);
                border: none;
                border-radius: 25px;
                padding: 12px 30px;
                font-weight: 600;
                transition: all 0.3s ease;
            }
            
            .btn-primary:hover {
                background: var(--airbnb-dark-red);
                transform: translateY(-2px);
            }
            
            .loading {
                display: none;
                text-align: center;
                padding: 2rem;
            }
            
            .spinner {
                border: 4px solid #f3f3f3;
                border-top: 4px solid var(--airbnb-red);
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin: 0 auto 1rem;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .listing-card {
                animation: fadeInUp 0.6s ease-out;
            }
            
            .form-control:focus, .form-select:focus {
                border-color: var(--airbnb-red);
                box-shadow: 0 0 0 0.2rem rgba(255, 90, 95, 0.25);
            }
            
            .image-placeholder {
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #6c757d;
                font-size: 3rem;
            }
        </style>
    </head>
    <body>
        <!-- Brand Header -->
        <div class="brand-header">
            <div class="container">
                <div class="row align-items-center">
                    <div class="col-md-6">
                        <a href="/" class="brand-logo">
                            <i class="fas fa-home"></i> AirBnB Clone
                        </a>
                        <p class="mb-0 mt-2">Find your perfect home away from home</p>
                    </div>
                    <div class="col-md-6 text-end">
                        <i class="fas fa-search fa-3x opacity-50"></i>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="container">
            <!-- Enhanced Search Form -->
            <div class="row justify-content-center mb-5">
                <div class="col-lg-10">
                    <form method="POST" action="/search" class="search-form p-4" id="searchForm">
                        <h3 class="text-center mb-4 text-muted">
                            <i class="fas fa-filter"></i> Find Your Perfect Stay
                        </h3>
                        
                        <div class="row g-3">
                            <!-- Location -->
                            <div class="col-md-4">
                                <label for="location" class="form-label">
                                    <i class="fas fa-map-marker-alt text-danger"></i> Location *
                                </label>
                                <select name="location" id="location" class="form-select" required>
                                    <option value="" disabled ${!selectedValues.location ? 'selected' : ''}>Choose a destination...</option>
                                    ${markets.map(market => 
                                        `<option value="${market}" ${selectedValues.location === market ? 'selected' : ''}>${market}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            
                            <!-- Property Type -->
                            <div class="col-md-4">
                                <label for="property_type" class="form-label">
                                    <i class="fas fa-building"></i> Property Type
                                </label>
                                <select name="property_type" id="property_type" class="form-select">
                                    <option value="">Any Type</option>
                                    ${propertyTypes.map(type => 
                                        `<option value="${type}" ${selectedValues.property_type === type ? 'selected' : ''}>${type}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            
                            <!-- Bedrooms -->
                            <div class="col-md-4">
                                <label for="bedrooms" class="form-label">
                                    <i class="fas fa-bed"></i> Bedrooms
                                </label>
                                <select name="bedrooms" id="bedrooms" class="form-select">
                                    <option value="">Any</option>
                                    <option value="0" ${selectedValues.bedrooms === '0' ? 'selected' : ''}>Studio</option>
                                    <option value="1" ${selectedValues.bedrooms === '1' ? 'selected' : ''}>1 Bedroom</option>
                                    <option value="2" ${selectedValues.bedrooms === '2' ? 'selected' : ''}>2 Bedrooms</option>
                                    <option value="3" ${selectedValues.bedrooms === '3' ? 'selected' : ''}>3 Bedrooms</option>
                                    <option value="4" ${selectedValues.bedrooms === '4' ? 'selected' : ''}>4+ Bedrooms</option>
                                </select>
                            </div>
                            
                            <!-- Price Range -->
                            <div class="col-md-3">
                                <label for="min_price" class="form-label">
                                    <i class="fas fa-dollar-sign"></i> Min Price
                                </label>
                                <input type="number" name="min_price" id="min_price" class="form-control" 
                                       placeholder="$0" min="0" value="${selectedValues.min_price || ''}">
                            </div>
                            
                            <div class="col-md-3">
                                <label for="max_price" class="form-label">
                                    <i class="fas fa-dollar-sign"></i> Max Price
                                </label>
                                <input type="number" name="max_price" id="max_price" class="form-control" 
                                       placeholder="$1000" min="0" value="${selectedValues.max_price || ''}">
                            </div>
                            
                            <!-- Guests -->
                            <div class="col-md-2">
                                <label for="guests" class="form-label">
                                    <i class="fas fa-users"></i> Guests
                                </label>
                                <select name="guests" id="guests" class="form-select">
                                    <option value="">Any</option>
                                    <option value="1" ${selectedValues.guests === '1' ? 'selected' : ''}>1 Guest</option>
                                    <option value="2" ${selectedValues.guests === '2' ? 'selected' : ''}>2 Guests</option>
                                    <option value="3" ${selectedValues.guests === '3' ? 'selected' : ''}>3 Guests</option>
                                    <option value="4" ${selectedValues.guests === '4' ? 'selected' : ''}>4 Guests</option>
                                    <option value="5" ${selectedValues.guests === '5' ? 'selected' : ''}>5+ Guests</option>
                                </select>
                            </div>
                            
                            <!-- Availability Dates -->
                            <div class="col-md-2">
                                <label for="check_in" class="form-label">
                                    <i class="fas fa-calendar-check"></i> Check-in
                                </label>
                                <input type="date" name="check_in" id="check_in" class="form-control" 
                                       value="${selectedValues.check_in || ''}">
                            </div>
                            
                            <div class="col-md-2">
                                <label for="check_out" class="form-label">
                                    <i class="fas fa-calendar-times"></i> Check-out
                                </label>
                                <input type="date" name="check_out" id="check_out" class="form-control" 
                                       value="${selectedValues.check_out || ''}">
                            </div>
                        </div>
                        
                        <div class="text-center mt-4">
                            <button type="submit" class="btn btn-primary btn-lg">
                                <i class="fas fa-search"></i> Search Properties
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            
            <!-- Loading Indicator -->
            <div class="loading" id="loading">
                <div class="spinner"></div>
                <p>Searching for the perfect properties...</p>
            </div>
            
            <!-- Results Header -->
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h2><i class="fas fa-home text-danger"></i> Available Properties</h2>
                <span class="badge bg-secondary fs-6">${listings.length} properties found</span>
            </div>
            
            <!-- Enhanced Listings -->
            <div class="row" id="listings">
                ${listings.map((listing, index) => {
                    const imageUrl = listing.images?.picture_url || '';
                    const reviews = listing.reviews || [];
                    const latestReview = reviews.length > 0 ? reviews[0] : null;
                    
                    return `
                    <div class="col-md-6 col-lg-4 mb-4" style="animation-delay: ${index * 0.1}s">
                        <div class="listing-card position-relative">
                            <!-- Property Image -->
                            <div class="position-relative" style="height: 200px; overflow: hidden;">
                                ${imageUrl ? 
                                    `<img src="${imageUrl}" alt="${listing.name}" class="property-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                     <div class="image-placeholder" style="display: none; height: 200px;">
                                         <i class="fas fa-image"></i>
                                     </div>` :
                                    `<div class="image-placeholder" style="height: 200px;">
                                         <i class="fas fa-image"></i>
                                     </div>`
                                }
                                <div class="availability-badge">
                                    <i class="fas fa-check-circle"></i> Available
                                </div>
                            </div>
                            
                            <!-- Property Details -->
                            <div class="p-3">
                                <h5>
                                    <a href="/bookings?listing_id=${listing._id}" class="listing-title">
                                        ${listing.name || 'Unnamed Property'}
                                    </a>
                                </h5>
                                
                                <p class="text-muted small mb-2" style="height: 40px; overflow: hidden;">
                                    ${(listing.summary || 'No description available').substring(0, 100)}...
                                </p>
                                
                                <!-- Property Info -->
                                <div class="row small text-muted mb-2">
                                    <div class="col-6">
                                        <i class="fas fa-bed"></i> ${listing.bedrooms || 0} beds
                                    </div>
                                    <div class="col-6">
                                        <i class="fas fa-users"></i> ${listing.accommodates || 'N/A'} guests
                                    </div>
                                </div>
                                
                                <!-- Price and Rating -->
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <span class="price">$${listing.price ? Number(listing.price).toFixed(2) : 'N/A'}/night</span>
                                    ${listing.review_scores && listing.review_scores.review_scores_rating ? 
                                        `<span class="rating">
                                            <i class="fas fa-star"></i> ${listing.review_scores.review_scores_rating}/100
                                         </span>` : 
                                        '<span class="text-muted small">No rating</span>'
                                    }
                                </div>
                                
                                <!-- Location -->
                                <small class="text-muted">
                                    <i class="fas fa-map-marker-alt"></i> ${listing.address?.market || 'Unknown location'}
                                </small>
                                
                                <!-- Latest Review Snippet -->
                                ${latestReview ? `
                                    <div class="review-snippet">
                                        <strong>"${latestReview.comments.substring(0, 60)}..."</strong>
                                        <br><small>- ${latestReview.reviewer_name}</small>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
                }).join('')}
            </div>
            
            ${listings.length === 0 ? `
                <div class="text-center py-5">
                    <div class="mb-4">
                        <i class="fas fa-search fa-4x text-muted"></i>
                    </div>
                    <h3 class="text-muted">No properties found</h3>
                    <p class="text-muted">Try adjusting your search filters or selecting a different location.</p>
                </div>
            ` : ''}
        </div>
        
        <script>
            // Set minimum dates to today
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('check_in').setAttribute('min', today);
            document.getElementById('check_out').setAttribute('min', today);
            
            // Update checkout min date when checkin changes
            document.getElementById('check_in').addEventListener('change', function() {
                const checkinDate = this.value;
                document.getElementById('check_out').setAttribute('min', checkinDate);
            });
            
            // Form submission with loading
            document.getElementById('searchForm').addEventListener('submit', function() {
                document.getElementById('listings').style.display = 'none';
                document.getElementById('loading').style.display = 'block';
            });
            
            // Smooth scroll to results after search
            if (${listings.length > 0 && selectedValues.location ? 'true' : 'false'}) {
                document.addEventListener('DOMContentLoaded', function() {
                    document.querySelector('#listings').scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'start'
                    });
                });
            }
        </script>
        
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
    `;
}

// Helper function to generate enhanced booking page HTML
function generateBookingPage(listing) {
    const imageUrl = listing.images?.picture_url || '';
    const reviews = listing.reviews || [];
    
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Book ${listing.name} - AirBnB Clone</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            :root {
                --airbnb-red: #ff5a5f;
                --airbnb-dark-red: #e74c3c;
                --airbnb-light-gray: #f7f7f7;
                --airbnb-dark-gray: #484848;
                --airbnb-green: #00a699;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: var(--airbnb-light-gray);
            }
            
            .property-header {
                background: white;
                border-radius: 15px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                overflow: hidden;
                margin-bottom: 2rem;
            }
            
            .property-image {
                width: 100%;
                height: 300px;
                object-fit: cover;
            }
            
            .image-placeholder {
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #6c757d;
                font-size: 4rem;
                height: 300px;
            }
            
            .booking-form {
                background: white;
                border-radius: 15px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                padding: 2rem;
            }
            
            .price-highlight {
                background: var(--airbnb-green);
                color: white;
                padding: 1rem;
                border-radius: 10px;
                text-align: center;
                margin-bottom: 1rem;
            }
            
            .rating-display {
                background: var(--airbnb-red);
                color: white;
                padding: 8px 15px;
                border-radius: 20px;
                display: inline-block;
                margin-bottom: 1rem;
            }
            
            .review-card {
                background: var(--airbnb-light-gray);
                border-radius: 10px;
                padding: 1rem;
                margin-bottom: 1rem;
                border-left: 4px solid var(--airbnb-red);
            }
            
            .btn-primary {
                background: var(--airbnb-red);
                border: none;
                border-radius: 25px;
                padding: 12px 30px;
                font-weight: 600;
                transition: all 0.3s ease;
            }
            
            .btn-primary:hover {
                background: var(--airbnb-dark-red);
                transform: translateY(-2px);
            }
            
            .btn-secondary {
                border-radius: 25px;
                padding: 12px 30px;
                font-weight: 600;
            }
            
            .form-control:focus, .form-select:focus {
                border-color: var(--airbnb-red);
                box-shadow: 0 0 0 0.2rem rgba(255, 90, 95, 0.25);
            }
            
            .property-amenities {
                background: white;
                border-radius: 10px;
                padding: 1rem;
                margin-bottom: 1rem;
            }
        </style>
    </head>
    <body>
        <div class="container mt-4">
            <!-- Back Navigation -->
            <nav aria-label="breadcrumb" class="mb-4">
                <ol class="breadcrumb">
                    <li class="breadcrumb-item">
                        <a href="/" class="text-decoration-none">
                            <i class="fas fa-home"></i> Search
                        </a>
                    </li>
                    <li class="breadcrumb-item active" aria-current="page">Book Property</li>
                </ol>
            </nav>
            
            <div class="row">
                <!-- Property Details -->
                <div class="col-lg-8">
                    <div class="property-header">
                        <!-- Property Image -->
                        ${imageUrl ? 
                            `<img src="${imageUrl}" alt="${listing.name}" class="property-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                             <div class="image-placeholder" style="display: none;">
                                 <i class="fas fa-image"></i>
                             </div>` :
                            `<div class="image-placeholder">
                                 <i class="fas fa-image"></i>
                             </div>`
                        }
                        
                        <!-- Property Info -->
                        <div class="p-4">
                            <h1 class="mb-3">${listing.name}</h1>
                            
                            <!-- Rating and Location -->
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                ${listing.review_scores?.review_scores_rating ? `
                                    <span class="rating-display">
                                        <i class="fas fa-star"></i> ${listing.review_scores.review_scores_rating}/100
                                    </span>
                                ` : '<span class="text-muted">No rating available</span>'}
                                
                                <span class="text-muted">
                                    <i class="fas fa-map-marker-alt"></i> ${listing.address?.market || 'Unknown location'}
                                </span>
                            </div>
                            
                            <!-- Property Description -->
                            <p class="text-muted mb-3">${listing.summary || 'No description available'}</p>
                            
                            <!-- Property Details -->
                            <div class="row mb-3">
                                <div class="col-sm-3">
                                    <strong><i class="fas fa-home"></i> Type:</strong><br>
                                    <span class="text-muted">${listing.property_type || 'Unknown'}</span>
                                </div>
                                <div class="col-sm-3">
                                    <strong><i class="fas fa-bed"></i> Bedrooms:</strong><br>
                                    <span class="text-muted">${listing.bedrooms || 0}</span>
                                </div>
                                <div class="col-sm-3">
                                    <strong><i class="fas fa-bath"></i> Bathrooms:</strong><br>
                                    <span class="text-muted">${listing.bathrooms || 'N/A'}</span>
                                </div>
                                <div class="col-sm-3">
                                    <strong><i class="fas fa-users"></i> Max Guests:</strong><br>
                                    <span class="text-muted">${listing.accommodates || 'N/A'}</span>
                                </div>
                            </div>
                            
                            <!-- Amenities -->
                            ${listing.amenities && listing.amenities.length > 0 ? `
                                <div class="property-amenities">
                                    <h5><i class="fas fa-check-circle text-success"></i> Amenities</h5>
                                    <div class="row">
                                        ${listing.amenities.slice(0, 8).map(amenity => `
                                            <div class="col-md-6 mb-1">
                                                <small><i class="fas fa-check text-success"></i> ${amenity}</small>
                                            </div>
                                        `).join('')}
                                        ${listing.amenities.length > 8 ? `
                                            <div class="col-12">
                                                <small class="text-muted">+ ${listing.amenities.length - 8} more amenities</small>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- Reviews Section -->
                    ${reviews.length > 0 ? `
                        <div class="bg-white rounded-3 p-4 shadow-sm">
                            <h3><i class="fas fa-comments text-primary"></i> Guest Reviews</h3>
                            ${reviews.slice(0, 3).map(review => `
                                <div class="review-card">
                                    <div class="d-flex justify-content-between align-items-start mb-2">
                                        <strong>${review.reviewer_name}</strong>
                                        <small class="text-muted">${new Date(review.date).toLocaleDateString()}</small>
                                    </div>
                                    <p class="mb-0">"${review.comments.length > 200 ? review.comments.substring(0, 200) + '...' : review.comments}"</p>
                                </div>
                            `).join('')}
                            ${reviews.length > 3 ? `
                                <p class="text-center text-muted">
                                    <small>+ ${reviews.length - 3} more reviews</small>
                                </p>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
                
                <!-- Booking Form -->
                <div class="col-lg-4">
                    <div class="booking-form position-sticky" style="top: 2rem;">
                        <!-- Price Display -->
                        <div class="price-highlight">
                            <h2 class="mb-0">
                                <i class="fas fa-dollar-sign"></i>$${listing.price ? Number(listing.price).toFixed(2) : 'N/A'}
                                <small>/night</small>
                            </h2>
                        </div>
                        
                        <form method="POST" action="/book" id="bookingForm">
                            <input type="hidden" name="listing_id" value="${listing._id}">
                            
                            <h4 class="mb-3">
                                <i class="fas fa-calendar-alt"></i> Booking Details
                            </h4>
                            
                            <!-- Check-in/Check-out -->
                            <div class="row mb-3">
                                <div class="col-6">
                                    <label for="check_in" class="form-label">Check-in</label>
                                    <input type="date" name="check_in" id="check_in" class="form-control" required>
                                </div>
                                <div class="col-6">
                                    <label for="check_out" class="form-label">Check-out</label>
                                    <input type="date" name="check_out" id="check_out" class="form-control" required>
                                </div>
                            </div>
                            
                            <!-- Guest Count -->
                            <div class="mb-3">
                                <label for="guest_count" class="form-label">
                                    <i class="fas fa-users"></i> Number of Guests
                                </label>
                                <select name="guest_count" id="guest_count" class="form-select" required>
                                    ${Array.from({length: listing.accommodates || 6}, (_, i) => i + 1).map(num => 
                                        `<option value="${num}">${num} Guest${num > 1 ? 's' : ''}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            
                            <!-- Price Calculation -->
                            <div class="card mb-3" style="background-color: var(--airbnb-light-gray);">
                                <div class="card-body">
                                    <div id="priceBreakdown">
                                        <p class="mb-1">Select dates to see total price</p>
                                    </div>
                                </div>
                            </div>
                            
                            <hr>
                            
                            <h4 class="mb-3">
                                <i class="fas fa-user"></i> Your Details
                            </h4>
                            
                            <div class="mb-3">
                                <label for="client_name" class="form-label">Full Name</label>
                                <input type="text" name="client_name" id="client_name" class="form-control" required>
                            </div>
                            
                            <div class="mb-3">
                                <label for="email" class="form-label">Email Address</label>
                                <input type="email" name="email" id="email" class="form-control" required>
                            </div>
                            
                            <div class="row mb-3">
                                <div class="col-6">
                                    <label for="daytime_phone" class="form-label">Daytime Phone</label>
                                    <input type="tel" name="daytime_phone" id="daytime_phone" class="form-control" required>
                                </div>
                                <div class="col-6">
                                    <label for="mobile_phone" class="form-label">Mobile Phone</label>
                                    <input type="tel" name="mobile_phone" id="mobile_phone" class="form-control" required>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label for="postal_address" class="form-label">Postal Address</label>
                                <textarea name="postal_address" id="postal_address" class="form-control" rows="2" required></textarea>
                            </div>
                            
                            <div class="mb-3">
                                <label for="home_address" class="form-label">Home Address</label>
                                <textarea name="home_address" id="home_address" class="form-control" rows="2" required></textarea>
                            </div>
                            
                            <!-- Special Requirements -->
                            <div class="mb-3">
                                <label for="special_requirements" class="form-label">
                                    <i class="fas fa-comment"></i> Special Requirements <small class="text-muted">(Optional)</small>
                                </label>
                                <textarea name="special_requirements" id="special_requirements" 
                                         class="form-control" rows="3" 
                                         placeholder="Any special requests, dietary requirements, accessibility needs, etc."></textarea>
                            </div>
                            
                            <div class="d-grid gap-2">
                                <button type="submit" class="btn btn-primary btn-lg">
                                    <i class="fas fa-check-circle"></i> Confirm Booking
                                </button>
                                <a href="/" class="btn btn-secondary">
                                    <i class="fas fa-arrow-left"></i> Back to Search
                                </a>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
        
        <script>
            const pricePerNight = ${listing.price || 0};
            
            // Set minimum date to today
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('check_in').setAttribute('min', today);
            document.getElementById('check_out').setAttribute('min', today);
            
            // Update checkout min date when checkin changes
            document.getElementById('check_in').addEventListener('change', function() {
                const checkinDate = this.value;
                document.getElementById('check_out').setAttribute('min', checkinDate);
                calculatePrice();
            });
            
            document.getElementById('check_out').addEventListener('change', calculatePrice);
            
            function calculatePrice() {
                const checkIn = document.getElementById('check_in').value;
                const checkOut = document.getElementById('check_out').value;
                const priceBreakdown = document.getElementById('priceBreakdown');
                
                if (checkIn && checkOut) {
                    const start = new Date(checkIn);
                    const end = new Date(checkOut);
                    const nights = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                    
                    if (nights > 0) {
                        const subtotal = nights * pricePerNight;
                        const cleaningFee = ${listing.cleaning_fee || 0};
                        const total = subtotal + cleaningFee;
                        
                        priceBreakdown.innerHTML = \`
                            <div class="d-flex justify-content-between">
                                <span>$\${pricePerNight.toFixed(2)} × \${nights} night\${nights > 1 ? 's' : ''}</span>
                                <span>$\${subtotal.toFixed(2)}</span>
                            </div>
                            \${cleaningFee > 0 ? \`
                                <div class="d-flex justify-content-between">
                                    <span>Cleaning fee</span>
                                    <span>$\${cleaningFee.toFixed(2)}</span>
                                </div>
                            \` : ''}
                            <hr>
                            <div class="d-flex justify-content-between">
                                <strong>Total</strong>
                                <strong>$\${total.toFixed(2)}</strong>
                            </div>
                        \`;
                    } else {
                        priceBreakdown.innerHTML = '<p class="text-danger mb-0">Check-out must be after check-in</p>';
                    }
                } else {
                    priceBreakdown.innerHTML = '<p class="mb-0">Select dates to see total price</p>';
                }
            }
            
            // Form validation
            document.getElementById('bookingForm').addEventListener('submit', function(e) {
                const checkIn = document.getElementById('check_in').value;
                const checkOut = document.getElementById('check_out').value;
                
                if (checkIn && checkOut) {
                    const start = new Date(checkIn);
                    const end = new Date(checkOut);
                    
                    if (end <= start) {
                        e.preventDefault();
                        alert('Check-out date must be after check-in date');
                        return false;
                    }
                }
            });
        </script>
        
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
    `;
}

// Helper function to generate enhanced confirmation page HTML
function generateConfirmationPage(bookingId, clientName, propertyName, checkInDate, checkOutDate, totalCost) {
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Booking Confirmed - AirBnB Clone</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            :root {
                --airbnb-red: #ff5a5f;
                --airbnb-dark-red: #e74c3c;
                --airbnb-light-gray: #f7f7f7;
                --airbnb-green: #00a699;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, var(--airbnb-light-gray), #e8f5e8);
                min-height: 100vh;
                display: flex;
                align-items: center;
            }
            
            .confirmation-card {
                background: white;
                border-radius: 20px;
                box-shadow: 0 15px 35px rgba(0,0,0,0.1);
                overflow: hidden;
                max-width: 600px;
                margin: 0 auto;
            }
            
            .success-header {
                background: linear-gradient(135deg, var(--airbnb-green), #28a745);
                color: white;
                padding: 3rem 2rem 2rem;
                text-align: center;
            }
            
            .success-icon {
                font-size: 4rem;
                margin-bottom: 1rem;
                animation: checkmark 0.6s ease-in-out;
            }
            
            @keyframes checkmark {
                0% { transform: scale(0); opacity: 0; }
                50% { transform: scale(1.2); }
                100% { transform: scale(1); opacity: 1; }
            }
            
            .booking-details {
                padding: 2rem;
            }
            
            .detail-row {
                border-bottom: 1px solid #f0f0f0;
                padding: 1rem 0;
            }
            
            .detail-row:last-child {
                border-bottom: none;
            }
            
            .btn-primary {
                background: var(--airbnb-red);
                border: none;
                border-radius: 25px;
                padding: 12px 30px;
                font-weight: 600;
                transition: all 0.3s ease;
                width: 100%;
            }
            
            .btn-primary:hover {
                background: var(--airbnb-dark-red);
                transform: translateY(-2px);
            }
            
            .reference-box {
                background: var(--airbnb-light-gray);
                border-radius: 10px;
                padding: 1rem;
                text-align: center;
                margin: 1rem 0;
                border-left: 4px solid var(--airbnb-green);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="confirmation-card">
                <!-- Success Header -->
                <div class="success-header">
                    <div class="success-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h1 class="mb-3">Booking Confirmed!</h1>
                    <p class="lead mb-0">Thank you for choosing AirBnB Clone, ${clientName}!</p>
                </div>
                
                <!-- Booking Details -->
                <div class="booking-details">
                    <!-- Reference Number -->
                    <div class="reference-box">
                        <h5 class="mb-2">Booking Reference</h5>
                        <h3 class="text-primary mb-0" style="font-family: monospace; letter-spacing: 2px;">
                            ${bookingId.toString().toUpperCase()}
                        </h3>
                    </div>
                    
                    <!-- Property Details -->
                    <div class="detail-row">
                        <div class="row">
                            <div class="col-4">
                                <strong><i class="fas fa-home text-primary"></i> Property:</strong>
                            </div>
                            <div class="col-8">
                                ${propertyName}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Check-in Details -->
                    <div class="detail-row">
                        <div class="row">
                            <div class="col-4">
                                <strong><i class="fas fa-calendar-check text-success"></i> Check-in:</strong>
                            </div>
                            <div class="col-8">
                                ${checkInDate.toLocaleDateString('en-US', { 
                                    weekday: 'long', 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric' 
                                })}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Check-out Details -->
                    <div class="detail-row">
                        <div class="row">
                            <div class="col-4">
                                <strong><i class="fas fa-calendar-times text-warning"></i> Check-out:</strong>
                            </div>
                            <div class="col-8">
                                ${checkOutDate.toLocaleDateString('en-US', { 
                                    weekday: 'long', 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric' 
                                })}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Duration -->
                    <div class="detail-row">
                        <div class="row">
                            <div class="col-4">
                                <strong><i class="fas fa-moon text-info"></i> Duration:</strong>
                            </div>
                            <div class="col-8">
                                ${nights} night${nights > 1 ? 's' : ''}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Total Cost -->
                    <div class="detail-row">
                        <div class="row">
                            <div class="col-4">
                                <strong><i class="fas fa-dollar-sign text-success"></i> Total Cost:</strong>
                            </div>
                            <div class="col-8">
                                <h4 class="text-success mb-0">$${totalCost.toFixed(2)}</h4>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Important Information -->
                    <div class="alert alert-info mt-3">
                        <h6><i class="fas fa-info-circle"></i> What's Next?</h6>
                        <ul class="mb-0 small">
                            <li>A confirmation email has been sent to your inbox</li>
                            <li>Your host will contact you 24-48 hours before check-in</li>
                            <li>Please save your booking reference for your records</li>
                            <li>Deposit: $${(totalCost * 0.2).toFixed(2)} (20% of total)</li>
                            <li>Balance due: $${(totalCost * 0.8).toFixed(2)} (7 days before check-in)</li>
                        </ul>
                    </div>
                    
                    <!-- Action Buttons -->
                    <div class="mt-4">
                        <a href="/" class="btn btn-primary mb-3">
                            <i class="fas fa-search"></i> Search More Properties
                        </a>
                        
                        <div class="text-center">
                            <small class="text-muted">
                                Need help? Contact our support team 24/7
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <script>
            // Celebration animation
            document.addEventListener('DOMContentLoaded', function() {
                // Add some confetti effect or other celebration
                console.log('Booking confirmed successfully!');
                
                // Auto-scroll to show confirmation
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        </script>
        
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
    `;
}

// Start server
connectDB().then(() => {
    app.listen(port, () => {
        console.log(`AirBnB Clone app listening on port ${port}`);
        console.log(`Open your browser to http://localhost:${port}`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    await client.close();
    process.exit(0);
});