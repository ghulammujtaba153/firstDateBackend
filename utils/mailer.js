// import nodemailer from "nodemailer";
// import dotenv from "dotenv";

// dotenv.config();

// export const transporter = nodemailer.createTransport({
//   // service: "gmail", 
//   host: "smtp.gmail.com",
//   port: 465,
//   secure: true,
//   auth: {
//     user: process.env.EMAIL_USER, // your email
//     pass: process.env.EMAIL_PASS, // your email app password
//   },
// });


import SibApiV3Sdk from "sib-api-v3-sdk";
import dotenv from "dotenv";

dotenv.config();

// Configure Brevo API Key
let defaultClient = SibApiV3Sdk.ApiClient.instance;
let apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY;

// Export Email API instance
export const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();

