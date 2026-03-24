const nodemailer = require("nodemailer");


// Looking to send emails in production? Check out our Email API/SMTP product!
// const transporter = nodemailer.createTransport({
//   host: "sandbox.smtp.mailtrap.io",
//   port: 2525,
//   auth: {
//     user: "b2934b100e9dfa",
//     pass: "5e63ae3edaccfd"
//   }
// });

module.exports = {
    sendMail: async (to,url) => {
        const info = await transporter.sendMail({
            from: 'Admin@hahah.com',
            to: to,
            subject: "request resetpassword email",
            text: "click vao day de reset", // Plain-text version of the message
            html: "click vao <a href="+url+">day</a> de reset", // HTML version of the message
        });

        console.log("Message sent:", info.messageId);
    },
    sendUserPasswordMail: async (to, username, password) => {
        const info = await transporter.sendMail({
            from: 'Admin@hahah.com',
            to: to,
            subject: "Thong tin tai khoan cua ban",
            text: `Tai khoan da duoc tao. Username: ${username}. Password: ${password}`,
            html: `<p>Tai khoan da duoc tao.</p><p>Username: <b>${username}</b></p><p>Password: <b>${password}</b></p>`,
        });

        console.log("Message sent:", info.messageId);
    }
}

