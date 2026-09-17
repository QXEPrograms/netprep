window.SECTION_BASICS = {
  id: 'basics',
  title: 'Networking Basics',
  short: 'Basics',
  weight: 20,
  blurb: 'The vocabulary and mental model everything else builds on: how data actually gets from one machine to another.',
  objectives: [
    {
      id: 'basics-lan-types',
      title: 'LAN types (SOHO, enterprise, datacenter)',
      image: 'lan-types',
      body: `
        <p>A <strong>LAN</strong> is just a bunch of computers close together that are all connected, like every computer in one building. There are three sizes you need to know:</p>
        <ul>
          <li><strong>SOHO</strong> (Small Office/Home Office) &mdash; a tiny network, like the one at your house. Just a few devices, plugged into one all-in-one router.</li>
          <li><strong>Enterprise</strong> &mdash; a BIG network for a company with hundreds or thousands of workers. It needs lots of separate equipment so it can stay organized and safe.</li>
          <li><strong>Datacenter</strong> &mdash; a network built just for computers to talk to OTHER computers, not people. It has to be super fast and almost never turn off.</li>
        </ul>
        <p><strong>Remember this:</strong> how big the company is tells you which LAN type fits. A tiny business = SOHO. A giant company = Enterprise. A place that just stores huge amounts of data = Datacenter.</p>
      `,
      diagram: null,
    },
    {
      id: 'basics-osi',
      title: 'OSI model, all 7 layers and their functions',
      image: 'osi-stack',
      body: `
        <p>Sending information across a network is like a 7-step relay race. The OSI model names each step. A fun way to remember them, from the bottom up, is: <strong>"Please Do Not Throw Sausage Pizza Away."</strong></p>
        <ol>
          <li><strong>1 Physical:</strong> the actual wires, cables, or Wi-Fi signal carrying the 1s and 0s.</li>
          <li><strong>2 Data Link:</strong> sends information between two nearby devices; this is where switches work.</li>
          <li><strong>3 Network:</strong> figures out the best path between different networks; this is where routers work.</li>
          <li><strong>4 Transport:</strong> makes sure every piece of information arrives, in the right order.</li>
          <li><strong>5 Session:</strong> opens the "conversation" between two devices, and closes it when they're done.</li>
          <li><strong>6 Presentation:</strong> translates the information into a format the app can read, like locking it up with encryption.</li>
          <li><strong>7 Application:</strong> the part you actually see, like a website or an email app.</li>
        </ol>
        <p><strong>Remember this:</strong> a switch is Layer 2. A router is Layer 3. Anything you see on your screen, like a website, is Layer 7.</p>
      `,
      diagram: 'osi',
    },
    {
      id: 'basics-data-travel',
      title: 'How data travels (packets, routers, switches)',
      image: 'data-road',
      body: `
        <p>Data doesn't travel as one giant chunk. It gets chopped into little pieces called <strong>packets</strong>, kind of like cutting a pizza into slices so it's easier to carry.</p>
        <ul>
          <li><strong>Switches</strong> are like a hallway monitor inside ONE building. They know exactly which room to send each packet to.</li>
          <li><strong>Routers</strong> are like mail carriers between different buildings (networks). They read the address on each packet and pick the best way to send it.</li>
        </ul>
        <p>So a packet hops from router to router until it reaches the right network, and then the switch there delivers it to the exact right computer.</p>
        <p><strong>Remember this:</strong> switch = inside one network. Router = between different networks. Don't mix them up!</p>
      `,
      diagram: null,
    },
    {
      id: 'basics-internet-access',
      title: 'How devices get internet access (ISP, equipment, cabling)',
      image: 'internet-chain',
      body: `
        <p>Here's the chain that gets a house or office online:</p>
        <p>Your internet company (called an <strong>ISP</strong>) sends a signal into the building &rarr; a <strong>modem</strong> turns that signal into something your devices understand &rarr; a <strong>router</strong> shares that one connection with all your devices, kind of like a big water pipe splitting into smaller pipes for every faucet in a house.</p>
        <p>The wire bringing the signal in can be <strong>cable</strong>, <strong>DSL</strong> (over phone lines), or <strong>fiber</strong> (light through glass &mdash; the fastest kind!).</p>
        <p><strong>Remember this:</strong> the modem talks to the internet company. The router shares the connection with your devices. Lots of home boxes do both jobs in one device, but they're still two separate jobs.</p>
      `,
      diagram: null,
    },
    {
      id: 'basics-addressing',
      title: 'IP addresses, MAC addresses, subnetting',
      image: 'address-tag',
      body: `
        <p>Every device needs two kinds of name tags:</p>
        <ul>
          <li><strong>MAC address</strong> &mdash; like a name tag glued onto the device itself. It never changes, no matter where the device goes.</li>
          <li><strong>IP address</strong> &mdash; like your house's mailing address. It can change depending on which network you're connected to.</li>
        </ul>
        <p><strong>Subnetting</strong> means splitting one big network into smaller groups, kind of like splitting a huge school into separate classrooms. It keeps things organized and makes each group safer.</p>
        <p><strong>Remember this:</strong> businesses split their network into smaller pieces mostly to stay organized and secure &mdash; not just because they have more computers.</p>
        <p><strong>Finding the network address (the fast way):</strong> take the one number in the subnet mask that isn't 255 or 0, and subtract it from 256. That's your "block size" &mdash; addresses count up in jumps of that size. Example: mask <code>255.255.255.192</code> &rarr; 256 &minus; 192 = 64, so blocks are 0, 64, 128, 192. An IP ending in <code>.50</code> falls in the 0&ndash;63 block, so the network address ends in <code>.0</code>. The broadcast address is always one less than where the next block starts &mdash; here, that's <code>.63</code>.</p>
        <p>This is exactly what the <strong>Subnet Calculator</strong> tool in this app does for you &mdash; type in any IP and mask and it shows the network address, broadcast address, and a color-coded picture of which bits are which. Practice with it until the pattern clicks.</p>
      `,
      diagram: null,
    },
    {
      id: 'basics-ipv4-ipv6',
      title: 'IPv4 vs IPv6, IPv4 address classes',
      image: 'ip-versions',
      body: `
        <p><strong>IPv4</strong> addresses look like <code>192.168.1.1</code>. There are only about 4.3 billion of them, and the world ran out of new ones because so many devices need one now!</p>
        <p><strong>IPv6</strong> addresses are much longer, like <code>2001:0db8:85a3::8a2e:0370:7334</code>. There are SO many more of them &mdash; basically we will never run out again.</p>
        <p>IPv4 addresses also come in "classes" based on their first number: Class A (huge networks), Class B (medium), and Class C (small, the most common for a home or office LAN).</p>
        <p><strong>Remember this:</strong> if a question asks why we needed IPv6, the answer is: we ran out of IPv4 addresses.</p>
      `,
      diagram: null,
    },
  ],
  questions: [
    {
      id: 'basics-q1', objectiveId: 'basics-lan-types', scenario: false,
      prompt: 'A 4-person startup wants the cheapest possible way to get all their laptops networked and online in one small office. Which LAN type fits best?',
      choices: ['Datacenter LAN', 'Enterprise LAN', 'SOHO LAN', 'Metropolitan LAN'],
      answer: 2,
      explanation: 'SOHO (Small Office/Home Office) networks are built for a small number of devices with minimal, low-cost, often all-in-one equipment &mdash; exactly this scenario.'
    },
    {
      id: 'basics-q2', objectiveId: 'basics-lan-types', scenario: true,
      prompt: 'A company with 2,000 employees across five departments needs strict traffic separation between departments and centralized policy control. Which LAN type &mdash; and why?',
      choices: ['SOHO, because an all-in-one router is easiest to manage centrally', 'Enterprise, because dedicated switches/routers/firewalls support segmentation and policy at scale', 'Datacenter, because it offers the most redundancy for critical systems', 'MAN, because it spans the most physical distance'],
      answer: 1,
      explanation: 'Enterprise networks use dedicated hardware and VLAN segmentation specifically to give large organizations that kind of departmental separation and centralized control. A datacenter LAN is built for server-to-server traffic, not user/department policy, and a MAN describes geographic scope, not this scenario.'
    },
    {
      id: 'basics-q3', objectiveId: 'basics-osi', scenario: false,
      prompt: 'At which OSI layer do switches primarily operate?',
      choices: ['Layer 1 (Physical)', 'Layer 2 (Data Link)', 'Layer 3 (Network)', 'Layer 4 (Transport)'],
      answer: 1,
      explanation: 'Switches forward frames based on MAC addresses within a local network &mdash; that is Layer 2, Data Link.'
    },
    {
      id: 'basics-q4', objectiveId: 'basics-osi', scenario: false,
      prompt: 'HTTP, FTP, and DNS are all protocols that operate at which OSI layer?',
      choices: ['Layer 3 (Network)', 'Layer 5 (Session)', 'Layer 6 (Presentation)', 'Layer 7 (Application)'],
      answer: 3,
      explanation: 'These are the protocols users and applications directly rely on &mdash; the defining feature of Layer 7, Application.'
    },
    {
      id: 'basics-q5', objectiveId: 'basics-osi', scenario: false,
      prompt: 'Encryption and data compression are handled at which OSI layer?',
      choices: ['Presentation (6)', 'Session (5)', 'Transport (4)', 'Data Link (2)'],
      answer: 0,
      explanation: 'The Presentation layer formats/translates data for the application layer, including encryption and compression.'
    },
    {
      id: 'basics-q6', objectiveId: 'basics-data-travel', scenario: false,
      prompt: 'A device forwards traffic between two different networks by reading destination IP addresses and consulting a routing table. What is this device?',
      choices: ['Switch', 'Router', 'Repeater', 'Hub'],
      answer: 1,
      explanation: 'Routing between distinct networks based on IP address and a routing table is the defining job of a router.'
    },
    {
      id: 'basics-q7', objectiveId: 'basics-data-travel', scenario: false,
      prompt: 'Why is data broken into packets instead of sent as one continuous stream?',
      choices: ['Packets encrypt the data automatically as a security measure', 'Packets can be routed independently, retransmitted individually if lost, and share the medium with other traffic', 'Packets remove the need for MAC addresses on the local network', 'Packets guarantee a fixed transfer speed regardless of network load'],
      answer: 1,
      explanation: 'Packetization allows independent routing, efficient sharing of the link, and recovery of only the lost pieces rather than the whole transmission. It has nothing to do with encryption, MAC addressing, or guaranteeing speed.'
    },
    {
      id: 'basics-q8', objectiveId: 'basics-internet-access', scenario: false,
      prompt: 'Which device converts an ISP\'s incoming signal (cable, DSL, or fiber) into data your local equipment can use?',
      choices: ['Switch', 'Modem', 'Access point', 'Firewall'],
      answer: 1,
      explanation: 'The modem is the translator between the ISP\'s transmission medium and your network.'
    },
    {
      id: 'basics-q9', objectiveId: 'basics-internet-access', scenario: false,
      prompt: 'Which last-mile internet technology transmits data as light through glass and generally offers the highest speed and reliability?',
      choices: ['DSL', 'Coaxial cable', 'Fiber optic', 'Fixed wireless'],
      answer: 2,
      explanation: 'Fiber optic transmits light signals through glass strands, offering the highest bandwidth and lowest signal loss of the common options.'
    },
    {
      id: 'basics-q10', objectiveId: 'basics-addressing', scenario: true,
      prompt: 'A network admin splits one large office network into four smaller subnets, one per department. What is the main networking benefit?',
      choices: ['It gives every device a MAC address', 'It reduces broadcast traffic and isolates departments for security/manageability', 'It doubles available bandwidth automatically', 'It removes the need for a router'],
      answer: 1,
      explanation: 'Subnetting shrinks broadcast domains and creates clean boundaries between groups of devices &mdash; the classic business reason to subnet.'
    },
    {
      id: 'basics-q11', objectiveId: 'basics-addressing', scenario: false,
      prompt: 'Which address type is physically burned into a network interface card and does not change when the device moves networks?',
      choices: ['IP address', 'MAC address', 'Subnet mask', 'Default gateway'],
      answer: 1,
      explanation: 'The MAC address is a hardware address assigned to the NIC itself, unlike the logical, location-dependent IP address.'
    },
    {
      id: 'basics-q12', objectiveId: 'basics-ipv4-ipv6', scenario: false,
      prompt: 'What is the primary reason IPv6 was developed to replace IPv4?',
      choices: ['IPv4 cannot be encrypted', 'IPv4\'s 32-bit address space was running out', 'IPv4 does not support wireless devices', 'IPv6 is required for fiber connections'],
      answer: 1,
      explanation: 'IPv4 offers roughly 4.3 billion addresses, which the growth of internet-connected devices exhausted &mdash; IPv6\'s 128-bit space was built to solve that.'
    },
    {
      id: 'basics-q13', objectiveId: 'basics-ipv4-ipv6', scenario: false,
      prompt: 'An IPv4 address begins with 192 in its first octet. Which class does it belong to?',
      choices: ['Class A', 'Class B', 'Class C', 'Class D'],
      answer: 2,
      explanation: 'Class C spans 192.0.0.0&ndash;223.255.255.255 and is the most common class for small LANs.'
    },
    {
      id: 'basics-q14', objectiveId: 'basics-addressing', scenario: false,
      prompt: 'A host has the IP address 192.168.10.50 with a subnet mask of 255.255.255.192 (/26). What is the network address?',
      choices: ['192.168.10.0', '192.168.10.32', '192.168.10.64', '192.168.10.192'],
      answer: 0,
      explanation: 'A /26 mask creates blocks of 64 addresses in the last octet (0, 64, 128, 192). 50 falls in the first block, so the network address is 192.168.10.0.'
    },
    {
      id: 'basics-q15', objectiveId: 'basics-addressing', scenario: false,
      prompt: 'How many usable host addresses are available on a /27 subnet?',
      choices: ['14', '30', '32', '62'],
      answer: 1,
      explanation: 'A /27 leaves 5 host bits, for 2^5 = 32 total addresses. Subtract 2 (network and broadcast) for 30 usable hosts. 14 is a /28, and 62 is a /26.'
    },
    {
      id: 'basics-q16', objectiveId: 'basics-addressing', scenario: false,
      prompt: 'What is the broadcast address for the network 10.0.4.0/22?',
      choices: ['10.0.4.255', '10.0.5.255', '10.0.7.255', '10.0.255.255'],
      answer: 2,
      explanation: 'A /22 mask creates blocks of 4 in the third octet (0, 4, 8, 12...). The 10.0.4.0 block runs through 10.0.7.255 before the next block (10.0.8.0) begins, so 10.0.7.255 is the broadcast address.'
    },
    {
      id: 'basics-q17', objectiveId: 'basics-addressing', scenario: false,
      prompt: 'A host has the IP address 172.16.130.15 with a /18 subnet mask. What is the network address?',
      choices: ['172.16.0.0', '172.16.128.0', '172.16.130.0', '172.16.192.0'],
      answer: 1,
      explanation: 'A /18 mask creates blocks of 64 in the third octet (0, 64, 128, 192). 130 falls in the 128&ndash;191 block, so the network address is 172.16.128.0 &mdash; not simply the third octet zeroed out to 172.16.130.0.'
    },
    {
      id: 'basics-q18', objectiveId: 'basics-addressing', scenario: false,
      prompt: 'Which CIDR notation is equivalent to the subnet mask 255.255.255.240?',
      choices: ['/26', '/27', '/28', '/29'],
      answer: 2,
      explanation: '240 in binary is 11110000 &mdash; four borrowed host bits in the last octet, on top of the 24 full network bits, giving /28.'
    },
    {
      id: 'basics-q19', objectiveId: 'basics-addressing', scenario: true,
      prompt: 'A small office needs a subnet with room for exactly 25 usable host addresses, and wants to avoid wasting address space. What is the smallest subnet (CIDR) that fits?',
      choices: ['/25', '/26', '/27', '/28'],
      answer: 2,
      explanation: 'A /28 only offers 14 usable hosts &mdash; too few. A /27 offers 30 usable hosts, which fits 25 with the least waste. /26 and /25 both work but provide far more addresses than needed.'
    },
  ],
};
