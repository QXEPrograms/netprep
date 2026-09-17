window.SECTION_PROTOCOLS = {
  id: 'protocols',
  title: 'Network Protocols and Standards',
  short: 'Protocols',
  weight: 20,
  blurb: 'The agreed-upon rules that let completely different devices and vendors talk to each other &mdash; transfer protocols, ports, routing, and encryption standards.',
  objectives: [
    {
      id: 'proto-transfer',
      title: 'Transfer protocols (FTP, SFTP, SMTP)',
      image: 'truck-delivery',
      body: `
        <ul>
          <li><strong>FTP:</strong> moves files between computers. The problem: it sends everything, even your password, in plain text that anyone could read if they were snooping.</li>
          <li><strong>SFTP:</strong> does the exact same job as FTP, but locks everything up in an encrypted tunnel first. It's the safe version.</li>
          <li><strong>SMTP:</strong> the protocol that sends your outgoing email to the next mail server.</li>
        </ul>
        <p><strong>Remember this:</strong> whenever a question says "secure" or "encrypted" file transfer, the answer is SFTP, not FTP.</p>
      `,
      diagram: null,
    },
    {
      id: 'proto-dns-dhcp',
      title: 'DNS, DHCP, IP address relationships',
      image: 'phonebook-badge',
      body: `
        <p><strong>DNS</strong> is like a giant phonebook: it turns a website name like "google.com" into the numeric address computers actually use to find it. Without DNS, you'd have to memorize a string of numbers for every website!</p>
        <p><strong>DHCP</strong> is like a badge machine at the front desk: whenever a new device joins the network, DHCP automatically hands it an address, instead of someone typing one in by hand.</p>
        <p><strong>Remember this:</strong> DNS turns a NAME into an address. DHCP HANDS OUT the address in the first place. Easy to mix these two up, so be careful!</p>
      `,
      diagram: null,
    },
    {
      id: 'proto-80211',
      title: '802.11 wireless standards',
      image: 'wifi-antenna',
      body: `
        <p><strong>802.11</strong> is just the name for the official rulebook that makes Wi-Fi work the same way on every device, no matter who made it. You'll see it written with extra letters, like 802.11ac or 802.11ax (also called Wi-Fi 5 and Wi-Fi 6) &mdash; the newer the letters, generally the faster and better it handles lots of devices at once.</p>
        <p><strong>Remember this:</strong> 802.11 = the Wi-Fi rulebook. Newer versions are usually faster.</p>
      `,
      diagram: null,
    },
    {
      id: 'proto-8023',
      title: '802.3 wired standards',
      image: 'ethernet-cable',
      body: `
        <p><strong>802.3</strong> is the rulebook for wired Ethernet &mdash; the cables you plug into the wall. It sets the rules for cables, speeds, and how the signal works, for everything from old slow Ethernet up to today's super-fast versions.</p>
        <p><strong>Remember this:</strong> 802.3 = wired cable rules. 802.11 = wireless Wi-Fi rules. Cable? Think 802.3. No cable? Think 802.11.</p>
      `,
      diagram: null,
    },
    {
      id: 'proto-tcp-udp',
      title: 'TCP vs UDP',
      image: 'race-cars',
      body: `
        <p><strong>TCP</strong> is careful and slow, like a delivery truck that checks every box arrived and puts them back in order if they got mixed up. Used for things that MUST be perfect, like loading a webpage or sending a file.</p>
        <p><strong>UDP</strong> is fast and doesn't look back, like a race car that just zooms ahead. It doesn't double-check anything, so it's used for things where speed matters more than perfection, like video calls or online games.</p>
        <p>Before TCP sends any real data, it does a quick handshake to make sure both sides are ready &mdash; three messages, in order: <strong>SYN</strong> ("can we talk?"), <strong>SYN-ACK</strong> ("yes, go ahead"), <strong>ACK</strong> ("great, starting now"). UDP skips this entirely, which is part of why it's faster.</p>
        <p><strong>Remember this:</strong> need it perfect? TCP (and its SYN, SYN-ACK, ACK handshake). Need it FAST, and a tiny glitch is okay? UDP.</p>
      `,
      diagram: null,
    },
    {
      id: 'proto-routing',
      title: 'Dynamic routing protocols (BGP, EIGRP, OSPF)',
      image: 'map-route',
      body: `
        <p><strong>OSPF</strong> and <strong>EIGRP</strong> are both like a GPS that only knows the streets INSIDE one neighborhood (one company's own network) &mdash; they find the fastest path within that one network.</p>
        <p><strong>BGP</strong> is the GPS for the whole world &mdash; it's the protocol that runs the entire internet, finding paths BETWEEN totally different companies and networks.</p>
        <p><strong>Remember this:</strong> OSPF/EIGRP work inside one network. BGP works between different networks across the whole internet.</p>
      `,
      diagram: null,
    },
    {
      id: 'proto-ports',
      title: 'Well-known ports (e.g., port 22 = SFTP/SSH)',
      image: 'door-numbers',
      body: `
        <p>Think of a computer as an apartment building, and ports as the numbered doors. Each door only lets in ONE kind of visitor (one kind of service). Some doors to remember:</p>
        <ul>
          <li><strong>22</strong> &mdash; SSH / SFTP</li>
          <li><strong>53</strong> &mdash; DNS</li>
          <li><strong>67/68</strong> &mdash; DHCP</li>
          <li><strong>80</strong> &mdash; HTTP (regular websites)</li>
          <li><strong>443</strong> &mdash; HTTPS (secure websites)</li>
        </ul>
        <p><strong>Remember this:</strong> learn 22, 53, 80, and 443 first &mdash; they show up the most. 80 and 443 do the same job (websites), but 443 is the locked, safer version.</p>
      `,
      diagram: null,
    },
    {
      id: 'proto-nat',
      title: 'NAT (network address translation)',
      image: 'shared-door',
      body: `
        <p><strong>NAT</strong> lets a whole building full of devices share just ONE public address when they go out onto the internet, kind of like a whole office sharing one return address on outgoing mail. The router keeps a list so it knows which device each reply belongs to.</p>
        <p>The devices inside use <strong>private addresses</strong> &mdash; ones set aside just for internal use and never handed out on the public internet. Three ranges are reserved for this: <code>10.0.0.0</code>&ndash;<code>10.255.255.255</code>, <code>172.16.0.0</code>&ndash;<code>172.31.255.255</code>, and <code>192.168.0.0</code>&ndash;<code>192.168.255.255</code>. Any address outside those ranges is public.</p>
        <p><strong>Remember this:</strong> NAT saves public addresses (since there aren't unlimited IPv4 ones) and also hides your private devices from being directly reachable from the outside internet.</p>
      `,
      diagram: null,
    },
    {
      id: 'proto-wireless-encryption',
      title: 'Wireless encryption standards (WPA2, WPA3)',
      image: 'wifi-shield',
      body: `
        <p><strong>WPA2</strong> has locked up Wi-Fi safely for years, but it has some known weak spots, especially around how it can be attacked by someone guessing your password offline.</p>
        <p><strong>WPA3</strong> is the newer, stronger version. It's much better at blocking those password-guessing attacks, and it even protects each device's traffic individually.</p>
        <p><strong>Remember this:</strong> WPA3 beats WPA2 mainly because it's much harder to crack the password offline &mdash; not just because it's newer.</p>
      `,
      diagram: null,
    },
  ],
  questions: [
    {
      id: 'proto-q1', objectiveId: 'proto-transfer', scenario: true,
      prompt: 'A company needs to transfer sensitive files between servers and wants the connection encrypted end-to-end. Which protocol should they use?',
      choices: ['FTP', 'SFTP', 'SMTP', 'Telnet'],
      answer: 1,
      explanation: 'SFTP transfers files over an encrypted SSH connection, unlike plain FTP which sends data (including credentials) in plaintext.'
    },
    {
      id: 'proto-q2', objectiveId: 'proto-transfer', scenario: false,
      prompt: 'Which protocol is responsible for sending outgoing email between mail servers?',
      choices: ['SMTP', 'FTP', 'DNS', 'DHCP'],
      answer: 0,
      explanation: 'SMTP (Simple Mail Transfer Protocol) handles sending/relaying outgoing email.'
    },
    {
      id: 'proto-q3', objectiveId: 'proto-dns-dhcp', scenario: false,
      prompt: 'Which protocol translates a domain name like "example.com" into the IP address needed to reach it?',
      choices: ['DHCP', 'DNS', 'NAT', 'SNMP'],
      answer: 1,
      explanation: 'DNS (Domain Name System) is responsible for translating human-readable names into IP addresses.'
    },
    {
      id: 'proto-q4', objectiveId: 'proto-dns-dhcp', scenario: true,
      prompt: 'A new laptop joins the office Wi-Fi and automatically receives an IP address, subnet mask, and default gateway with no manual setup. What made this possible?',
      choices: ['DNS', 'DHCP', 'NAT', 'BGP'],
      answer: 1,
      explanation: 'DHCP automatically assigns IP addressing information to devices joining a network.'
    },
    {
      id: 'proto-q5', objectiveId: 'proto-80211', scenario: false,
      prompt: 'The 802.11 family of IEEE standards defines which type of networking?',
      choices: ['Wired Ethernet', 'Wireless LAN (Wi-Fi)', 'Fiber optic backbones', 'Cellular networks'],
      answer: 1,
      explanation: '802.11 is the IEEE standard family that defines Wi-Fi / wireless LAN communication.'
    },
    {
      id: 'proto-q6', objectiveId: 'proto-8023', scenario: false,
      prompt: 'The 802.3 family of IEEE standards defines which type of networking?',
      choices: ['Wired Ethernet', 'Wireless LAN (Wi-Fi)', 'Bluetooth', 'Satellite internet'],
      answer: 0,
      explanation: '802.3 is the IEEE standard family underlying wired Ethernet.'
    },
    {
      id: 'proto-q7', objectiveId: 'proto-tcp-udp', scenario: true,
      prompt: 'An online multiplayer game prioritizes low latency and can tolerate an occasional dropped packet rather than wait for retransmission. Which transport protocol fits best?',
      choices: ['TCP', 'UDP', 'FTP', 'SMTP'],
      answer: 1,
      explanation: 'UDP skips the overhead of guaranteed delivery and ordering, favoring speed &mdash; ideal for real-time applications like gaming and streaming.'
    },
    {
      id: 'proto-q8', objectiveId: 'proto-tcp-udp', scenario: true,
      prompt: 'A user downloads a software installer and it is critical that every byte arrives intact and in order. Which transport protocol should the download use?',
      choices: ['UDP', 'TCP', 'ARP', 'ICMP only'],
      answer: 1,
      explanation: 'TCP guarantees reliable, ordered delivery &mdash; essential when data integrity matters more than raw speed.'
    },
    {
      id: 'proto-q9', objectiveId: 'proto-routing', scenario: false,
      prompt: 'Which routing protocol is used to route traffic between different organizations/ISPs across the internet itself?',
      choices: ['OSPF', 'EIGRP', 'BGP', 'DHCP'],
      answer: 2,
      explanation: 'BGP is the exterior routing protocol that determines paths across the internet between autonomous networks.'
    },
    {
      id: 'proto-q10', objectiveId: 'proto-routing', scenario: false,
      prompt: 'OSPF and EIGRP are both examples of what kind of routing protocol?',
      choices: ['Exterior routing protocols used between the internet\'s ISPs', 'Interior routing protocols used within a single organization\'s network', 'Wireless encryption protocols', 'File transfer protocols'],
      answer: 1,
      explanation: 'Both OSPF and EIGRP are interior gateway protocols, operating within one organization\'s network rather than across the internet.'
    },
    {
      id: 'proto-q11', objectiveId: 'proto-ports', scenario: false,
      prompt: 'Which port number is associated with SSH and secure file transfer (SFTP)?',
      choices: ['Port 21', 'Port 22', 'Port 80', 'Port 443'],
      answer: 1,
      explanation: 'Port 22 is the well-known port for SSH, which SFTP tunnels through.'
    },
    {
      id: 'proto-q12', objectiveId: 'proto-ports', scenario: false,
      prompt: 'Which port is used for encrypted web traffic (HTTPS)?',
      choices: ['Port 80', 'Port 25', 'Port 443', 'Port 53'],
      answer: 2,
      explanation: 'Port 443 is the standard port for HTTPS, the encrypted version of web traffic; port 80 is plain HTTP.'
    },
    {
      id: 'proto-q13', objectiveId: 'proto-ports', scenario: false,
      prompt: 'Which port is associated with DNS?',
      choices: ['Port 53', 'Port 67', 'Port 22', 'Port 3389'],
      answer: 0,
      explanation: 'Port 53 is the standard port for DNS queries.'
    },
    {
      id: 'proto-q14', objectiveId: 'proto-nat', scenario: true,
      prompt: 'An office has 50 employees but only one public IP address from its ISP. How can all 50 devices still reach the internet simultaneously?',
      choices: ['DNS', 'NAT', 'BGP', '802.3'],
      answer: 1,
      explanation: 'NAT allows many devices with private internal IP addresses to share one public IP address, translating between them.'
    },
    {
      id: 'proto-q15', objectiveId: 'proto-wireless-encryption', scenario: true,
      prompt: 'A business is upgrading its wireless security and wants better protection against offline password-guessing attacks than its current setup offers. What should they upgrade to, and why?',
      choices: ['WPA2, because it is the current industry standard', 'WPA3, because its SAE handshake better resists offline password attacks', 'WEP, because it is simpler to configure', 'No upgrade needed &mdash; all Wi-Fi encryption is equally secure'],
      answer: 1,
      explanation: 'WPA3\'s SAE (Simultaneous Authentication of Equals) handshake specifically strengthens resistance to offline brute-force password attacks compared to WPA2.'
    },
    {
      id: 'proto-q16', objectiveId: 'proto-wireless-encryption', scenario: false,
      prompt: 'What type of encryption does WPA2 use?',
      choices: ['AES', 'RSA only', 'No encryption', 'MD5'],
      answer: 0,
      explanation: 'WPA2 uses AES (Advanced Encryption Standard) for encrypting wireless traffic.'
    },
    {
      id: 'proto-q17', objectiveId: 'proto-dns-dhcp', scenario: true,
      prompt: 'A laptop joins a network and needs to load a website. Put the two protocol steps in the correct order.',
      choices: ['DNS resolves the site name first, then DHCP assigns the laptop an IP address', 'DHCP assigns the laptop an IP address first, then DNS resolves the site name to reach it', 'Both happen simultaneously and order never matters', 'DNS assigns the address, then DHCP resolves the site name'],
      answer: 1,
      explanation: 'The laptop needs its own IP address (from DHCP) before it can send or receive any traffic at all &mdash; including the DNS query needed to resolve the website\'s name to an address.'
    },
    {
      id: 'proto-q18', objectiveId: 'proto-tcp-udp', scenario: false,
      prompt: 'What is the correct order of TCP\'s three-way handshake used to establish a connection?',
      choices: ['ACK, SYN, SYN-ACK', 'SYN, SYN-ACK, ACK', 'SYN-ACK, SYN, ACK', 'SYN, ACK, SYN-ACK'],
      answer: 1,
      explanation: 'TCP opens a connection with SYN (the client requests a connection), SYN-ACK (the server acknowledges and replies), then ACK (the client confirms) &mdash; only then does data start flowing.'
    },
    {
      id: 'proto-q19', objectiveId: 'proto-ports', scenario: false,
      prompt: 'Which of the following correctly pairs a port number with its protocol?',
      choices: ['Port 21 &mdash; SSH', 'Port 25 &mdash; SMTP', 'Port 53 &mdash; HTTPS', 'Port 443 &mdash; DNS'],
      answer: 1,
      explanation: 'Port 25 is SMTP (outgoing email). Port 21 is FTP (not SSH, which is port 22), port 53 is DNS (not HTTPS), and port 443 is HTTPS (not DNS) &mdash; the other three pairings are swapped.'
    },
    {
      id: 'proto-q20', objectiveId: 'proto-nat', scenario: false,
      prompt: 'Which of the following is a private IP address that would need NAT to reach the public internet?',
      choices: ['8.8.8.8', '172.16.5.20', '203.0.113.10', '1.1.1.1'],
      answer: 1,
      explanation: '172.16.0.0&ndash;172.31.255.255 is one of the reserved private address ranges (along with 10.0.0.0/8 and 192.168.0.0/16). The other three are all public, internet-routable addresses.'
    },
  ],
};
