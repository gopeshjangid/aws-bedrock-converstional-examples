import {a} from '@aws-amplify/backend';

export const UserBlock = a
  .model({
    userId: a.string().required(), // The user doing the blocking
    blockedUserId: a.string().required(), // The user being blocked
    reason: a.string(),
    blockUser: a.belongsTo('User', 'blockedUserId'),
  })
  .authorization(allow => [allow.owner('userPools')])
  .secondaryIndexes(index => [index('userId')]);

export const ProfileImage = a.customType({
  location: a.string(),
  key: a.string(),
});

const smokingDrinkingOptions = ['FORMER', 'SOCIAL', 'REGULAR', 'PREFER_NOT_TO_SAY', 'OTHER'];

export const Favorite = a
  .model({
    userId: a.string().required(), // The user who is favoriting
    favoriteUserId: a.string().required(), // Reference to the favorite user
    user: a.belongsTo('User', 'favoriteUserId'),
  })
  .authorization(allow => [allow.owner('userPools')])
  .secondaryIndexes(index => [index('userId')]);

export const UserTermsConditions = a
  .model({
    userId: a.string().required(), // Reference to the favorite user
    screenLocation: a.string().required(),
    acceptedDateTime: a.datetime(),
    deviceInfo: a.json().required(),
    termVersion: a.string().default('1.0'),
    termsUrl: a.string(),
  })
  .authorization(allow => [
    allow.owner('userPools'),
    allow.authenticated().to(['list', 'get']),
  ]);

export const UserLocation = a.customType({
  type: a.string(),
  coordinates: a.float().array(), // [longitude, latitude]
  pincode: a.integer(),
  city: a.string(),
  state: a.string(),
  address: a.string(),
});

// Define User model with the custom nested types
export const userModel = a
  .model({
    uid: a.string().required(), // Unique identifier for the user
    userId: a.id().required(), // Unique identifier for the user
    accountStep: a.integer().default(0), // Step in account setup process
    loginType: a.string().required(), // Login type (email, mobile, etc.)
    connectedLoginApps: a.string().array(),
    email: a.string(), // User email
    fullName: a.string().required(), // Full name of the user
    dateOfBirth: a.string().required(), // Date of birth (for age calculation)
    gender: a.string().required(), // Gender
    bio: a.string().required(), // User bio or description
    location: a.ref('UserLocation').required(),
    profileImage: a.string(),
    otherImages: a.string().array(),
    selfieImage: a.string(),
    // User Interests
    interests: a.string().array(), // Array of interests
    lookingFor: a.enum(['SERIOUS', 'CASUAL', 'SERIOUS_MARRIAGE']), // Looking for (relationship type)
    availabilityList: a.enum([
      'ALWAYS',
      'WEEKDAYS',
      'WEEKENDS',
      'EVENING',
      'NIGHT',
      'MORNING',
      'NONE',
    ]),
    availability: a.string().array(),
    communicationStyle: a.string().array(),
    engagement: a.enum(['HIGH', 'MEDIUM', 'LOW']),
    response: a.enum(['HIGH', 'MEDIUM', 'LOW']),
    notificationsEnabled: a.boolean(),
    lastActive: a.timestamp(),
    diet: a.enum(['VEGETARIAN', 'NON_VEGETARIAN', 'VEGAN', 'OTHERS', 'NONE']), // Dietary preference
    fitness: a.enum(['ACTIVE', 'MODERATE', 'SEDENTARY', 'NONE']), // Fitness level
    smoking: a.enum(smokingDrinkingOptions), // Smoking habit
    drinking: a.enum(smokingDrinkingOptions), // Drinking habit
    style: a.enum(['DIRECT', 'INDIRECT', 'EMPATHETIC', 'ASSERTIVE', 'NONE']), // Communication preference
    communiticationMediumList: a.enum(['TEXT', 'CALL', 'VIDEO_CALL', 'NONE']),
    // Account Status
    accountStatus: a.string().default('INACTIVE'), // Account status (ACTIVE, INACTIVE, etc.)
    profileSetup: a.boolean().default(false), // Flag for profile completion

    updatedAt: a.datetime().default(new Date().toISOString()),

    // Corrected blockedUsers association
    blockedUsers: a.hasMany('UserBlock', 'blockedUserId'), // Referencing userId in UserBlock
    callers: a.hasMany('CallLog', 'callerId'),
    callees: a.hasMany('CallLog', 'calleeId'),
    // Favorites (referencing other User IDs)
    favorites: a.hasMany('Favorite', 'favoriteUserId'), // Each user has many favorites
    //featureUsage: a.hasMany('UserFeatureUsage', 'userId'),
    //activities: a.hasMany('Activity', 'authorId'),
    includeInSearch: a.boolean().default(true),
    onboardingCompleted: a.boolean(),
    profileVerified: a.boolean(),
    userDetailsCreated: a.boolean(),
    preferencesCreated: a.boolean(),
    partnerPreferencesCreated: a.boolean(),
    faceVerified: a.boolean(),
    partnerPreference: a.json(),
    profilePhotoVisible: a.boolean().default(true),
    credibleScore: a.integer().default(100),
    reportCount: a.integer().default(0),
    termsAccepted: a.boolean().default(false),
    deviceToken: a.string(),
    plateform: a.enum(['ANDROID', 'IOS', 'WEB']),
    pushNotificationsEnabled: a.boolean().default(true),
  })
  .identifier(['userId'])
  .secondaryIndexes(index => [
    index('uid').name('getUserByUid').queryField('getUserByUid'),
  ])
  .authorization(allow => [
    allow.guest().to(['list', 'get']),
    allow
      .ownerDefinedIn('uid')
      .to(['list', 'get', 'create', 'update', 'delete']),
    allow.authenticated().to(['list', 'get']),
  ]);

export const Activity = a.customType({
  activityId: a.string(),
  type: a.enum(['IMAGE', 'MOOD', 'ACTIVITY', 'SYSTEM', 'ADVERTISE']),
  imageUrl: a.string().array(), // For images
  caption: a.string(), // For predefined activities like 'Hiking', 'Reading'
  chatId: a.string(),
  status: a.string(),
  authorId: a.string(),
  createdAt: a.string(),
  authorProfileImage: a.string(),
  authorFullName: a.string(),
});

export const ReportUser = a
  .model({
    id: a.string().required(),
    reportedUserId: a.string().required(),
    reportedBy: a.string().required(),
    // Reason for reporting (e.g., "harassment", "spam", "fake profile", etc.)
    reason: a.string().required(),
    reportLevel: a.enum(['INITIAL', 'WARNING', 'SEVERE']),
    finalAnalyses: a.string(),
    // For example: "PENDING", "UNDER_REVIEW", "RESOLVED", "REJECTED".
    status: a.string().default('PENDING'),
    // Timestamps (store as ISO strings)
    createdAt: a.datetime().default(new Date().toISOString()),
  })
  .authorization(allow => [
    allow.owner('userPools'),
    allow.authenticated().to(['list', 'listen', 'create']),
  ]);

// Define a custom type for Notification in DynamoDB.
export const Notification = a
  .model({
    // Partition key: the ID of the user who receives the notification.
    userId: a.string().required(),
    // Sort key: a unique notification identifier. This could be a UUID or generated string.
    id: a.string().required(),
    // The type of notification, e.g., "REQUEST_SENT", "BLOCKED", "MESSAGE_RECEIVED", etc.
    type: a.string().required(),
    // Optional title to display for the notification.
    title: a.string().required(),
    targetId: a.string(),
    // The main notification message.
    message: a.string(),
    // Read status – defaults to false.
    createdAt: a.datetime().default(new Date().toISOString()),
    // Flexible JSON field to store any extra metadata (e.g., counts, device info, additional context)
    metadata: a.json(),
  })
  .secondaryIndexes(index => [
    index('userId').sortKeys(['createdAt']).queryField('getUserNotifications'),
  ])
  .authorization(allow => [
    allow.owner('userPools'),
    allow.authenticated().to(['list', 'listen', 'create', 'get']),
  ]);
