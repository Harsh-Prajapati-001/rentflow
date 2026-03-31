# 📱 Twilio Phone OTP Setup Guide
# Configure Twilio with Supabase for SMS verification in RentFlow

## How it works in RentFlow

Registration flow:
  1. User fills form → clicks "Create Account"
  2. Supabase sends email verification link
  3. User clicks email link → email confirmed
  4. User clicks "Send SMS OTP" → Twilio sends 6-digit SMS
  5. User enters OTP → phone verified → account fully active

## Step 1 — Twilio Account Setup

1. Go to https://twilio.com → Sign up (free trial gives $15 credit)
2. After signup, go to your Console Dashboard
3. Note down these three values:
   - Account SID  (looks like: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
   - Auth Token   (looks like: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
4. Go to Phone Numbers → Manage → Buy a number
   - Choose India (+91) or any SMS-capable number
   - Make sure it has "SMS" capability ticked
   - Cost: ~$1/month
5. Note down your Twilio Phone Number (e.g. +12025551234)

## Step 2 — Configure Twilio in Supabase

1. Go to your Supabase project → Authentication → Providers
2. Find "Phone" in the list → click to expand
3. Toggle it ON
4. Set Provider to: Twilio
5. Fill in:
   - Twilio Account SID:    paste from Step 1
   - Twilio Auth Token:     paste from Step 1
   - Twilio Message Service SID or From Number: your Twilio phone number
6. Set OTP Expiry: 600 (10 minutes is recommended)
7. Set SMS Template to something like:
   Your RentFlow verification code is: {{ .Token }}
8. Click Save

## Step 3 — Enable Phone confirmations in Supabase

1. Still in Authentication → go to "Email" settings
2. Make sure "Enable email confirmations" is ON
3. Go to Authentication → URL Configuration
4. Set Site URL to your Vercel URL: https://your-app.vercel.app
5. Add to Redirect URLs: https://your-app.vercel.app/**

## Step 4 — Test the flow

1. Open your Vercel app → Register page
2. Fill in details with a real phone number
3. Click "Create Account"
4. Check email → click verification link
5. Go back to app → click "Send SMS OTP to +91XXXXXXXXXX"
6. Check your phone for a 6-digit SMS
7. Enter it → you should be redirected to the dashboard

## Troubleshooting

"Phone provider is not enabled"
→ Make sure you toggled Phone ON in Supabase Auth → Providers

"Invalid phone number"
→ The number must be in E.164 format: +91XXXXXXXXXX
→ RentFlow automatically prepends +91 for 10-digit Indian numbers

"SMS not received"
→ Check Twilio Console → Monitor → Logs → Messages
→ Make sure your Twilio number is verified for the destination country
→ On Twilio free trial, you can only send to verified numbers (add them in Twilio Console → Verified Caller IDs)

"OTP expired"
→ Default expiry is 60 seconds — increase it to 600 in Supabase Auth settings

## Free Trial Limits

Twilio free trial:
- $15 credit (enough for ~500 SMS messages)
- Can only send to verified phone numbers until you upgrade
- To verify a number: Twilio Console → Phone Numbers → Verified Caller IDs → Add

For production: upgrade Twilio account ($0 credit card hold, pay as you go ~₹0.50-2 per SMS)

## Indian Phone Numbers Note

RentFlow stores phones as 10 digits (9876543210) in the database.
When sending OTP, it automatically converts to +919876543210 for Twilio.
This is handled in AuthPage.jsx in the formatPhone() function.
