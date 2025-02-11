import dotenv from 'dotenv';
import cron from 'node-cron';
import { sendScheduledEmails } from './services/emailService';

// Load environment variables
dotenv.config();

// Schedule email sending every minute
cron.schedule('* * * * *', async () => {
  console.log('Checking for scheduled emails...');
  await sendScheduledEmails();
});

console.log('Email service started'); 