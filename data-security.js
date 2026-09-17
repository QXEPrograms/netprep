window.SECTION_SECURITY = {
  id: 'security',
  title: 'Network Security',
  short: 'Security',
  weight: 25,
  blurb: 'The single biggest section on the exam. How networks get attacked, how they get defended, and the vocabulary that separates a "risk" from a "threat" from an "exploit."',
  objectives: [
    {
      id: 'sec-terms',
      title: 'Risk vs vulnerability vs exploit vs threat',
      image: 'door-lock',
      body: `
        <p>These four words sound alike but mean different things. Think of a house with a door that doesn't lock right:</p>
        <ul>
          <li><strong>Vulnerability:</strong> the weak spot itself &mdash; the door that won't lock.</li>
          <li><strong>Threat:</strong> someone or something that COULD use that weak spot &mdash; a burglar walking by.</li>
          <li><strong>Exploit:</strong> the burglar actually picking the lock and getting in.</li>
          <li><strong>Risk:</strong> how worried you should be overall &mdash; how likely it is AND how bad it would be if it happened.</li>
        </ul>
        <p><strong>Remember this:</strong> weak spot = vulnerability. Someone who might attack it = threat. Them actually doing it = exploit. How worried to be = risk.</p>
      `,
      diagram: null,
    },
    {
      id: 'sec-risk-sources',
      title: 'Internal/external risk sources (zero-day, employees, outdated software)',
      image: 'inside-outside',
      body: `
        <p><strong>Risks from the inside:</strong> an employee clicking a bad link by accident, someone using an old un-updated program, or a coworker who's not careful with passwords.</p>
        <p><strong>Risks from the outside:</strong> hackers, cybercriminals, and something called a <strong>zero-day</strong> &mdash; a brand new problem in a program that the company hasn't even found or fixed yet. It's scary because there's no fix available at all, yet!</p>
        <p><strong>Remember this:</strong> "zero-day" means the company has had zero days to fix it. It's brand new, so it's extra risky.</p>
      `,
      diagram: null,
    },
    {
      id: 'sec-basic-forms',
      title: 'Basic security forms (user management, permissions, encryption, authentication)',
      image: 'security-layers',
      body: `
        <p>Keeping a network safe uses a few teamwork pieces:</p>
        <ul>
          <li><strong>User management:</strong> giving people accounts and only the access they actually need &mdash; not more.</li>
          <li><strong>Permissions:</strong> rules about who is allowed to open, change, or delete specific files.</li>
          <li><strong>Encryption:</strong> scrambling data into secret code so only someone with the right key can read it.</li>
          <li><strong>Authentication:</strong> proving you really are who you say you are before you get in, like a password or fingerprint.</li>
        </ul>
        <p><strong>Remember this:</strong> authentication checks WHO you are. Permissions decide WHAT you can touch. Encryption protects the data itself, just in case someone still sneaks past.</p>
      `,
      diagram: null,
    },
    {
      id: 'sec-malware-protection',
      title: 'Malware protection (antivirus, filtering, patch management)',
      image: 'shield-bug',
      body: `
        <ul>
          <li><strong>Antivirus:</strong> a program that scans for and removes bad software (malware).</li>
          <li><strong>Filtering:</strong> blocks dangerous emails and websites before you can even click on them.</li>
          <li><strong>Patch management:</strong> keeping software updated so known weak spots get fixed.</li>
        </ul>
        <p><strong>Remember this:</strong> most malware sneaks in through weak spots that ALREADY had a fix available. Keeping things updated is one of the simplest, most powerful defenses there is.</p>
      `,
      diagram: null,
    },
    {
      id: 'sec-dos',
      title: 'DoS attacks (botnets, overload, DDoS)',
      image: 'flood-wave',
      body: `
        <p>A <strong>DoS attack</strong> floods a website or server with so many fake requests that it can't respond to real users anymore. It's not about stealing anything &mdash; it's about shutting things down.</p>
        <p>A <strong>DDoS attack</strong> is the same idea, but done by a huge army of hijacked computers all at once, called a <strong>botnet</strong>. Since the attack comes from thousands of different places, it's much harder to block.</p>
        <p><strong>Remember this:</strong> DoS = one attacker. DDoS = a whole botnet of computers attacking together.</p>
      `,
      diagram: null,
    },
    {
      id: 'sec-common-attacks',
      title: 'Common attacks (phishing, spoofing, poisoning)',
      image: 'fishing-hook',
      body: `
        <ul>
          <li><strong>Phishing:</strong> a fake email or message that tricks you into giving up your password or clicking something dangerous, by pretending to be someone you trust.</li>
          <li><strong>Spoofing:</strong> pretending to be someone else, like faking the sender's name on an email or faking a device's address.</li>
          <li><strong>Poisoning:</strong> sneaking bad information into a trusted system, like tricking the internet's "address book" (DNS) into sending people to a fake website instead of the real one.</li>
        </ul>
        <p><strong>Remember this:</strong> phishing tricks a PERSON. Spoofing fakes an IDENTITY. Poisoning corrupts trusted INFORMATION.</p>
      `,
      diagram: null,
    },
    {
      id: 'sec-cia',
      title: 'Confidentiality, integrity, availability (CIA triad)',
      image: 'cia-triangle',
      body: `
        <p>These three words are the whole point of security &mdash; what we're actually trying to protect:</p>
        <ul>
          <li><strong>Confidentiality:</strong> only the right people can see the data.</li>
          <li><strong>Integrity:</strong> the data hasn't been secretly changed by someone.</li>
          <li><strong>Availability:</strong> the data and systems are there and working when people need them.</li>
        </ul>
        <p><strong>Remember this:</strong> a DDoS attack hurts availability. Someone secretly changing your grades would hurt integrity. A stranger reading your private messages hurts confidentiality.</p>
      `,
      diagram: null,
    },
    {
      id: 'sec-mitigations',
      title: 'Vulnerability mitigations (closing ports, updates, antivirus)',
      image: 'closed-doors',
      body: `
        <ul>
          <li><strong>Close unused ports:</strong> every open "door" into a system is a chance for an attacker to get in, so shut the ones you're not using.</li>
          <li><strong>Keep things updated:</strong> fixes known weak spots before someone can use them.</li>
          <li><strong>Antivirus:</strong> catches bad software that sneaks through anyway.</li>
        </ul>
        <p><strong>Remember this:</strong> almost every fix is really about the same idea &mdash; leave fewer doors open for an attacker to try.</p>
      `,
      diagram: null,
    },
    {
      id: 'sec-hashing-certs',
      title: 'Hashing, digital signatures, certificates',
      image: 'fingerprint-seal',
      body: `
        <ul>
          <li><strong>Hashing:</strong> turns data into a short code, like a fingerprint for that exact file. If even one letter changes, the fingerprint changes completely &mdash; so it proves a file wasn't secretly altered.</li>
          <li><strong>Digital signature:</strong> a hash that's locked with the sender's secret key, so you can prove it really came from them AND that it wasn't changed.</li>
          <li><strong>Digital certificate:</strong> like an ID card for a website, proving it's really who it says it is &mdash; this is what makes HTTPS trustworthy.</li>
        </ul>
        <p><strong>Remember this:</strong> hashing proves nothing was changed. A signature also proves who sent it. A certificate is what lets your browser trust a website in the first place.</p>
      `,
      diagram: null,
    },
    {
      id: 'sec-authentication',
      title: 'Authentication methods (MFA, SSO, remote authentication)',
      image: 'key-phone-fingerprint',
      body: `
        <ul>
          <li><strong>MFA</strong> (Multi-Factor Authentication): proving who you are with TWO different kinds of proof, like a password (something you know) plus a code on your phone (something you have). Much safer than a password alone.</li>
          <li><strong>SSO</strong> (Single Sign-On): one login gets you into several different apps, so you don't need a password for each one. Handy, but if that one account gets stolen, so does everything connected to it.</li>
          <li><strong>Remote authentication:</strong> proving who you are when you're connecting from somewhere outside the building, usually with extra encryption to protect your login on the way there.</li>
        </ul>
        <p><strong>Remember this:</strong> "password + fingerprint" is real MFA, because they're two different kinds of proof. "Password + PIN" is NOT real MFA, since both are just things you know.</p>
      `,
      diagram: null,
    },
  ],
  questions: [
    {
      id: 'sec-q1', objectiveId: 'sec-terms', scenario: false,
      prompt: 'A server is running outdated, unpatched software. In security terminology, what is this weakness called?',
      choices: ['A threat', 'A vulnerability', 'An exploit', 'A risk'],
      answer: 1,
      explanation: 'The weakness itself &mdash; the unpatched software &mdash; is the vulnerability. The threat is who/what might target it; the exploit is how they would.'
    },
    {
      id: 'sec-q2', objectiveId: 'sec-terms', scenario: false,
      prompt: 'A piece of code specifically written to take advantage of an unpatched vulnerability is called a(n):',
      choices: ['Risk', 'Threat', 'Exploit', 'Control'],
      answer: 2,
      explanation: 'An exploit is the actual method or code used to take advantage of a vulnerability.'
    },
    {
      id: 'sec-q3', objectiveId: 'sec-risk-sources', scenario: false,
      prompt: 'What makes a "zero-day" vulnerability especially dangerous?',
      choices: ['It only affects networks zero days old', 'The vendor has had no time to release a patch for it', 'It cannot be exploited remotely', 'It only affects outdated hardware'],
      answer: 1,
      explanation: 'Zero-day means the vendor has had zero days to fix it &mdash; there is no patch yet, so standard mitigation (patching) is not yet possible.'
    },
    {
      id: 'sec-q4', objectiveId: 'sec-risk-sources', scenario: true,
      prompt: 'An employee accidentally emails a spreadsheet of customer data to the wrong recipient. What kind of risk source is this?',
      choices: ['External risk', 'Zero-day risk', 'Internal risk', 'Supply-chain risk'],
      answer: 2,
      explanation: 'Employee mistakes, even accidental ones, are classified as internal risk sources since they originate inside the organization.'
    },
    {
      id: 'sec-q5', objectiveId: 'sec-basic-forms', scenario: false,
      prompt: 'Giving a user access only to the specific files and systems required for their job, and nothing more, describes which principle?',
      choices: ['Zero trust encryption', 'Principle of least privilege', 'Multi-factor authentication', 'Digital signing'],
      answer: 1,
      explanation: 'The principle of least privilege means granting the minimum access necessary &mdash; a core part of user management and permissions.'
    },
    {
      id: 'sec-q6', objectiveId: 'sec-malware-protection', scenario: true,
      prompt: 'A company keeps getting infected by malware that exploits a vulnerability patched by the vendor six months ago. What is the most direct fix?',
      choices: ['Buy more antivirus licenses', 'Improve patch management so updates are applied promptly', 'Switch to a different operating system', 'Disable all email attachments permanently'],
      answer: 1,
      explanation: 'Since a patch already exists, the real gap is patch management &mdash; the update simply is not being applied in time.'
    },
    {
      id: 'sec-q7', objectiveId: 'sec-malware-protection', scenario: false,
      prompt: 'Which of the following best describes the role of email/web filtering in malware protection?',
      choices: ['It repairs infected files after the fact', 'It blocks malicious content before a user can interact with it', 'It replaces the need for antivirus software', 'It only works on internal network traffic'],
      answer: 1,
      explanation: 'Filtering is a preventive control &mdash; it stops malicious emails, attachments, or sites before the user ever has the chance to click them.'
    },
    {
      id: 'sec-q8', objectiveId: 'sec-dos', scenario: false,
      prompt: 'What is the key difference between a DoS attack and a DDoS attack?',
      choices: ['DDoS steals data; DoS does not', 'DDoS comes from many distributed sources (often a botnet); DoS comes from one source', 'DoS only affects wireless networks', 'There is no real difference'],
      answer: 1,
      explanation: 'DDoS is distributed &mdash; traffic floods in from many machines at once (a botnet), which is what makes it much harder to block than a single-source DoS attack.'
    },
    {
      id: 'sec-q9', objectiveId: 'sec-dos', scenario: false,
      prompt: 'A network of thousands of compromised, remotely-controlled devices used to flood a target with traffic is called a:',
      choices: ['VPN', 'Botnet', 'Honeypot', 'Firewall cluster'],
      answer: 1,
      explanation: 'A botnet is a collection of compromised devices controlled remotely, commonly used to power DDoS attacks.'
    },
    {
      id: 'sec-q10', objectiveId: 'sec-common-attacks', scenario: true,
      prompt: 'An employee receives an email that looks like it is from the CEO, asking them to urgently wire money. This is an example of:',
      choices: ['DNS poisoning', 'Phishing (specifically spear phishing)', 'ARP spoofing', 'A DDoS attack'],
      answer: 1,
      explanation: 'A targeted, impersonation-based email trying to trick a specific person into an action is spear phishing, a targeted form of phishing.'
    },
    {
      id: 'sec-q11', objectiveId: 'sec-common-attacks', scenario: false,
      prompt: 'An attacker feeds a DNS resolver false records so that users trying to reach a legitimate bank website are redirected to a fake one. This is:',
      choices: ['DNS poisoning', 'Phishing', 'A DDoS attack', 'Hashing collision'],
      answer: 0,
      explanation: 'Corrupting the data a DNS resolver trusts to redirect users is the definition of DNS (cache) poisoning.'
    },
    {
      id: 'sec-q12', objectiveId: 'sec-common-attacks', scenario: false,
      prompt: 'Disguising a packet\'s source IP address to make it appear as if it came from a trusted device is called:',
      choices: ['IP spoofing', 'Phishing', 'Hashing', 'Patch management'],
      answer: 0,
      explanation: 'Faking a source identity, such as an IP address, is spoofing.'
    },
    {
      id: 'sec-q13', objectiveId: 'sec-cia', scenario: true,
      prompt: 'A DDoS attack takes an online store completely offline for six hours. Which part of the CIA triad is most directly violated?',
      choices: ['Confidentiality', 'Integrity', 'Availability', 'Authenticity'],
      answer: 2,
      explanation: 'A DDoS attack prevents legitimate users from accessing the system &mdash; that is an availability violation.'
    },
    {
      id: 'sec-q14', objectiveId: 'sec-cia', scenario: true,
      prompt: 'An attacker secretly alters financial records in a database without detection. Which part of the CIA triad is most directly violated?',
      choices: ['Confidentiality', 'Integrity', 'Availability', 'Authentication'],
      answer: 1,
      explanation: 'Unauthorized alteration of data &mdash; even without exposing or blocking it &mdash; is an integrity violation.'
    },
    {
      id: 'sec-q15', objectiveId: 'sec-mitigations', scenario: false,
      prompt: 'Why is closing unused network ports considered a security mitigation?',
      choices: ['It increases network speed', 'It reduces the number of potential entry points for an attacker', 'It automatically encrypts all traffic', 'It replaces the need for antivirus software'],
      answer: 1,
      explanation: 'Every open, unused port is a possible entry point &mdash; closing it shrinks the attack surface an attacker could target.'
    },
    {
      id: 'sec-q16', objectiveId: 'sec-hashing-certs', scenario: false,
      prompt: 'What does hashing a file primarily allow you to verify?',
      choices: ['The confidentiality of the file', 'The integrity of the file (that it has not been altered)', 'The identity of the file\'s author', 'The file\'s encryption strength'],
      answer: 1,
      explanation: 'Because a hash changes if even one bit of the input changes, comparing hashes verifies the file has not been tampered with &mdash; an integrity check.'
    },
    {
      id: 'sec-q17', objectiveId: 'sec-hashing-certs', scenario: false,
      prompt: 'A digital signature adds which capability on top of a plain hash?',
      choices: ['Faster transmission speed', 'Proof of authenticity &mdash; who actually sent it', 'Automatic virus removal', 'Unlimited file size support'],
      answer: 1,
      explanation: 'Because a digital signature is encrypted with the sender\'s private key, only that sender could have produced it &mdash; proving authenticity in addition to integrity.'
    },
    {
      id: 'sec-q18', objectiveId: 'sec-hashing-certs', scenario: false,
      prompt: 'What role does a digital certificate play in HTTPS?',
      choices: ['It speeds up page load times', 'It binds a public key to a verified identity, proving a website is who it claims to be', 'It stores the user\'s browsing history securely', 'It replaces the need for a password'],
      answer: 1,
      explanation: 'A certificate, issued by a trusted Certificate Authority, links a public key to a verified identity &mdash; the foundation of HTTPS trust.'
    },
    {
      id: 'sec-q19', objectiveId: 'sec-authentication', scenario: true,
      prompt: 'A company requires employees to enter a password and then approve a push notification on their phone to log in. What is this an example of?',
      choices: ['Single Sign-On (SSO)', 'Multi-Factor Authentication (MFA)', 'DNS poisoning protection', 'Data encryption'],
      answer: 1,
      explanation: 'A password (something you know) plus a phone approval (something you have) are two different factor categories &mdash; that is MFA.'
    },
    {
      id: 'sec-q20', objectiveId: 'sec-authentication', scenario: false,
      prompt: 'What is a key security trade-off of Single Sign-On (SSO)?',
      choices: ['It requires more passwords than normal logins', 'A compromised SSO account can grant access to every connected system', 'It cannot be used with cloud applications', 'It disables MFA by design'],
      answer: 1,
      explanation: 'SSO centralizes access &mdash; convenient, but it also means one compromised account can expose every system tied to it.'
    },
  ],
};
