var ImapConnection = require('imap').ImapConnection,
    MailParser = require('mailparser').MailParser,
    nodemailer = require('nodemailer'),
    _ = require('underscore');

// Settings...
var emailAddress = 'wufoo@joedrumgoole.com',
    password = 'gargletech';

function doCycle() {

  // Set up our IMAP and SMPT servers first of all...
  var  imap = new ImapConnection({
    username: emailAddress,
    password: password,
    host: 'imap.gmail.com',
    port: 993,
    secure: true
  });

  var smtpTransport = nodemailer.createTransport("SMTP",{
    service: "Gmail",
    auth: {
      user: emailAddress,
      pass: password
    }
  });

  var goFetch = _.after(1, function() {
    imap.openBox('INBOX', false, function(err, res) {
      if (err) throw err;

      imap.search(['UNSEEN'], function(error, response) {
        var fetch = imap.fetch(response, {markSeen: true, request: {headers: false, body: 'full'}});

        fetch.on('message', function(msg) {
          // new MailParser for every msg.
          var mailparser = new MailParser();
          console.log('mailparser created...');

          mailparser.on('end', function(mail) {
            console.log('Mailing message...');

            smtpTransport.sendMail({
              from: emailAddress,
              to: 'feedhenry-platform@tickets.assembla.com',
              subject: mail.subject,
              text: mail.text.replace(/([\s\S]*)\s--\s[\s\S]*/gi, '$1')
            }, function(sendErr, sendRes) {
              if (sendErr) {
                console.log('Error sending mail!');
                return false;
              }
              console.log('Sent... ' + sendRes.message);
            });
            msg.on('data', function(chunk) {
              mailparser.write(chunk);
            });
            msg.on('end', function() {
              mailparser.end();
            });
          });
          fetch.on('end', function() {
            console.log('Done fetching all messages!');
            imap.logout(function() { console.log('Goodbye!'); });
          });
        });
      });
    });
  });

  imap.connect(function(err) {
    if (err) throw err;
    goFetch();
  });
}

setTimeout(doCycle, 30000);
