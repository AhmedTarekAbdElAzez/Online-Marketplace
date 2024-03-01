const nodemailer = require("nodemailer");
// Nodemailer
const sendEmail = async (options) => {
  // create transporter(service that will send email like "gmail"-"mailgun"-"mailtrap")
  const transporter = nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // Define email options (like from.. to.. , subject, email content)
  const mailOpts = {
    from: "E-shop App <Tarek@gmail.com>",
    to: options.email,
    subject: options.subject,
    text: options.message,
  };

  // Send email
  await transporter.sendEmail(mailOpts);
};
module.exports = sendEmail;
