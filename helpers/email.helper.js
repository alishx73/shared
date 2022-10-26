import { createTransport } from 'nodemailer';
// npm i nodemailer when network available

const mailConfig = {
  service: 'gmail',
  secure: true,
  port: 465,
  author: {
    user: 'hellotorum.com',
    pass: 'thunderu$e619', // eamil password is incorrect
  },
};

const transporter = createTransport(mailConfig);

export default transporter;
