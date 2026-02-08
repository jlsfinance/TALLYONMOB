const nodemailer = require('nodemailer');

class MailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS
            }
        });
    }

    async sendContactMail({ name, email, subject, message }) {
        const mailOptions = {
            from: process.env.MAIL_USER,
            to: process.env.MAIL_USER,
            replyTo: email,
            subject: `TallyLink Contact: ${subject || 'New Message'} from ${name}`,
            text: `
                New Contact Form Submission:
                
                Name: ${name}
                Email: ${email}
                Subject: ${subject}
                
                Message:
                ${message}
            `,
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #10b981;">New TallyLink Contact</h2>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p><strong>Message:</strong></p>
                    <p style="white-space: pre-wrap;">${message}</p>
                </div>
            `
        };

        return this.transporter.sendMail(mailOptions);
    }
}

module.exports = new MailService();
