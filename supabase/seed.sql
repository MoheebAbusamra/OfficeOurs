-- =====================================================================
-- OfficeOurs demo data. this is just seed data for the schema.ql
-- All names, IDs, module codes and timetables are fictional seeded,
-- it has our 3 names .
--
-- Dates are based on emta btrun el code (current_date)
-- Weekend assumption, like in egypt friday and saturday
--emails are real ashan ntest Brevo API for sending emails
-- =====================================================================

-- ---------------- Groups + modules ----------------
insert into groups (id, name) values
  (1, 'CS-Y3-G1'),
  (2, 'CS-Y3-G2'),
  (3, 'CS-Y3-G3');

insert into modules (id, code, name) values
  (1, '25CSCI37H', 'Introduction to Cloud Computing'),
  (2, '25CSCI32H', 'Distributed Systems'),
  (3, '25CSCI35H', 'Human-Computer Interaction'),
  (4, '25CSCI31H', 'Software Project Management'),
  (5, '25CSCI34H', 'Artificial Neural Networks');

-- keep serial counters in sync with the explicit ids above
select setval('groups_id_seq', 3);
select setval('modules_id_seq', 5);

-- ---------------- Registry: who can register ----------------
insert into university_registry (university_id, full_name, email, role, group_id) values
  -- instructors (register with their staff ID)
  ('I-1001', 'Dr. Sara Hassan',  'sara.hassan@officeours.test',  'instructor', null),
  ('I-1002', 'Dr. Omar Nabil',   'omar.nabil@officeours.test',   'instructor', null),
  ('I-1003', 'Dr. Mona Fathy',   'mona.fathy@officeours.test',   'instructor', null),
  -- team members (CHANGE these emails to your real ones)
  ('241339', 'Judy Tarek',       'judy241339@bue.edu.eg',   'student', 1),
  ('248690', 'Moheeb Abusamra',  'moheeb248690@bue.edu.eg', 'student', 2),
  ('244690', 'Ahmed Ellebishy',  'ahmed244690@bue.edu.eg', 'student', 3),
  -- extra demo students
  ('240101', 'Nour Adel',        'nour.adel@officeours.test',    'student', 1),
  ('240102', 'Youssef Kamal',    'youssef.kamal@officeours.test','student', 1),
  ('240201', 'Mariam Samir',     'mariam.samir@officeours.test', 'student', 2),
  ('240202', 'Karim Fouad',      'karim.fouad@officeours.test',  'student', 2),
  ('240301', 'Laila Mostafa',    'laila.mostafa@officeours.test','student', 3),
  ('240302', 'Hassan Ali',       'hassan.ali@officeours.test',   'student', 3);

-- ---------------- Who studies / teaches what ----------------
insert into group_modules (group_id, module_id) values
  (1, 1), (1, 2), (1, 3), (1, 4),
  (2, 1), (2, 2), (2, 4), (2, 5),
  (3, 1), (3, 3), (3, 4), (3, 5);

insert into instructor_modules (instructor_id, module_id) values
  ('I-1001', 1), ('I-1001', 2),
  ('I-1002', 3), ('I-1002', 4),
  ('I-1003', 5), ('I-1003', 1);

-- ---------------- Weekly timetables (0 = Sunday ... 4 = Thursday) ----------------
insert into schedule_entries (group_id, module_id, day_of_week, start_time, end_time, kind) values
  -- G1
  (1, 1, 0, '09:00', '11:00', 'lecture'),
  (1, 2, 0, '12:00', '14:00', 'lecture'),
  (1, 3, 1, '10:00', '12:00', 'lecture'),
  (1, 1, 2, '10:00', '12:00', 'lab'),
  (1, 4, 3, '09:00', '11:00', 'lecture'),
  (1, 2, 4, '13:00', '15:00', 'tutorial'),
  -- G2
  (2, 2, 0, '09:00', '11:00', 'lecture'),
  (2, 5, 1, '12:00', '14:00', 'lecture'),
  (2, 1, 2, '14:00', '16:00', 'lecture'),
  (2, 4, 3, '10:00', '12:00', 'lecture'),
  (2, 1, 3, '13:00', '15:00', 'lab'),
  (2, 5, 4, '09:00', '11:00', 'tutorial'),
  -- G3
  (3, 3, 0, '11:00', '13:00', 'lecture'),
  (3, 1, 1, '09:00', '11:00', 'lecture'),
  (3, 5, 2, '12:00', '14:00', 'lecture'),
  (3, 4, 3, '14:00', '16:00', 'lecture'),
  (3, 1, 4, '10:00', '12:00', 'lab'),
  (3, 3, 4, '13:00', '15:00', 'tutorial');

-- ---------------- Upcoming slots: next 14 days, weekly pattern, weekends skipped ----------------
insert into slots (instructor_id, module_id, slot_date, start_time, end_time, location, capacity)
select t.instructor_id, t.module_id, d::date, t.start_time::time, t.end_time::time, t.location, t.capacity
from generate_series(current_date + 1, current_date + 14, interval '1 day') as d
join (values
  ('I-1001', 1, 0, '10:00', '12:00', 'Room C-204', 6),
  ('I-1001', 1, 2, '10:00', '12:00', 'Room C-204', 6),
  ('I-1001', 2, 3, '13:00', '14:00', 'Room C-204', 3),
  ('I-1002', 3, 1, '11:00', '13:00', 'Room B-110', 5),
  ('I-1002', 4, 4, '09:00', '10:30', 'Room B-110', 4),
  ('I-1003', 5, 2, '14:00', '16:00', 'Lab A-015',  5),
  ('I-1003', 1, 3, '10:00', '11:00', 'Lab A-015',  3)
) as t(instructor_id, module_id, dow, start_time, end_time, location, capacity)
  on extract(dow from d) = t.dow;

-- ---------------- Past slots (for meeting history): 2 most recent weekdays ----------------
insert into slots (instructor_id, module_id, slot_date, start_time, end_time, location, capacity)
select 'I-1001', 1, d, '10:00', '12:00', 'Room C-204', 6
from (select d::date as d from generate_series(current_date - 10, current_date - 1, interval '1 day') d
      where extract(dow from d) not in (5, 6) order by d desc limit 1) x;

insert into slots (instructor_id, module_id, slot_date, start_time, end_time, location, capacity)
select 'I-1002', 3, d, '11:00', '13:00', 'Room B-110', 5
from (select d::date as d from generate_series(current_date - 10, current_date - 1, interval '1 day') d
      where extract(dow from d) not in (5, 6) order by d desc offset 1 limit 1) x;

-- ---------------- FAQs (used by the Gemini API FAQ check) ----------------
insert into faqs (instructor_id, module_id, question, answer) values
  ('I-1001', 1, 'When is the cloud project deadline?',
   'The final project is due in week 12. Check the module page for the exact date and submission link.'),
  ('I-1001', 1, 'Can we use AWS free tier instead of Floci?',
   'No. Deployment must use Floci (AWS emulator); you may add Vercel or Cloudflare on top.'),
  ('I-1001', 2, 'How is the distributed systems coursework graded?',
   'Coursework is 40% of the module: 20% lab tasks and 20% the group project.'),
  ('I-1002', 3, 'How many participants do we need for usability testing?',
   'At least 5 participants per design iteration is enough for this module.'),
  ('I-1002', 4, 'What format should the project plan be in?',
   'Submit a Gantt chart plus a risk register as a single PDF.'),
  ('I-1003', 5, 'Which framework should we use for the ANN assignment?',
   'Either TensorFlow/Keras or PyTorch is accepted; explain your choice in the report.'),
  ('I-1003', 1, 'What is the difference between IaaS, PaaS and SaaS?',
   'IaaS gives you virtual machines, PaaS gives you a managed platform to deploy code, SaaS gives you a finished application. See lecture 2 slides.');

-- ---------------- Sample requests in every status ----------------
-- completed (past) -> has a meeting with notes
insert into requests (student_id, slot_id, title, description, preferred_start, preferred_end, priority, status, opened_at, created_at)
select '241339', s.id, 'Help with milestone 1 architecture diagram',
       'I am not sure how to show the three layers and the external APIs on the diagram.',
       '10:00', '10:15', 'normal', 'completed', s.slot_date - 1 + time '15:00', s.slot_date - 2 + time '09:00'
from slots s where s.instructor_id = 'I-1001' and s.slot_date < current_date;

insert into requests (student_id, slot_id, title, description, preferred_start, preferred_end, priority, status, opened_at, created_at)
select '248690', s.id, 'Usability test plan review',
       'I would like feedback on my usability test tasks before running the sessions.',
       '11:00', '11:20', 'high', 'completed', s.slot_date - 1 + time '12:00', s.slot_date - 3 + time '10:00'
from slots s where s.instructor_id = 'I-1002' and s.slot_date < current_date;

-- confirmed (upcoming) -> in the queue
insert into requests (student_id, slot_id, title, description, preferred_start, preferred_end, priority, status, opened_at)
select '241339', s.id, 'Floci Lambda deployment question',
       'My Lambda deploys to Floci but API Gateway returns 502 when I call it.',
       '10:00', '10:15', 'high', 'confirmed', now()
from slots s where s.instructor_id = 'I-1001' and s.slot_date > current_date
order by s.slot_date, s.start_time limit 1;

-- pending (upcoming, not opened yet) -> student can still edit
insert into requests (student_id, slot_id, title, description, preferred_start, preferred_end, priority, status)
select '244690', s.id, 'Clarification on cloud service models',
       'I need help choosing and justifying the cloud model for our project report.',
       '10:15', '10:30', 'normal', 'pending'
from slots s where s.instructor_id = 'I-1001' and s.slot_date > current_date
order by s.slot_date, s.start_time limit 1;

insert into requests (student_id, slot_id, title, description, preferred_start, preferred_end, priority, status)
select '240201', s.id, 'Backpropagation derivation',
       'I get stuck deriving the gradient for the hidden layer in the lab sheet.',
       '14:00', '14:20', 'low', 'pending'
from slots s where s.instructor_id = 'I-1003' and s.slot_date > current_date
order by s.slot_date, s.start_time limit 1;

-- rejected
insert into requests (student_id, slot_id, title, description, preferred_start, preferred_end, priority, status, opened_at, status_reason)
select '240101', s.id, 'Project deadline date',
       'When exactly is the final cloud project due and where do we submit?',
       '10:30', '10:40', 'low', 'rejected', now(), 'This is answered in the FAQ: week 12, see the module page.'
from slots s where s.instructor_id = 'I-1001' and s.slot_date > current_date
order by s.slot_date, s.start_time limit 1;

-- ---------------- Queue entries ----------------
-- past meetings: done
insert into queue_entries (slot_id, request_id, position, status, checked_in_at, called_at, finished_at)
select r.slot_id, r.id, 1, 'done',
       s.slot_date + time '09:55', s.slot_date + r.preferred_start, s.slot_date + r.preferred_end
from requests r join slots s on s.id = r.slot_id
where r.status = 'completed';

-- upcoming confirmed: waiting in position 1
insert into queue_entries (slot_id, request_id, position, status)
select r.slot_id, r.id, 1, 'waiting'
from requests r where r.status = 'confirmed';

-- ---------------- Meeting history with notes ----------------
insert into meetings (request_id, slot_id, student_id, instructor_id, started_at, ended_at, instructor_notes, student_notes)
select r.id, r.slot_id, r.student_id, s.instructor_id,
       s.slot_date + r.preferred_start, s.slot_date + r.preferred_end,
       case s.instructor_id
         when 'I-1001' then 'Explained the 3 layers; student should add Supabase and the external APIs to the diagram.'
         else 'Tasks are good; reduce to 5 tasks and add a post-test questionnaire.' end,
       case s.instructor_id
         when 'I-1001' then 'Redraw diagram with labels for each cloud service.'
         else 'Cut tasks to 5, add SUS questionnaire.' end
from requests r join slots s on s.id = r.slot_id
where r.status = 'completed';

-- ---------------- Notifications ----------------
insert into notifications (recipient_id, type, message, link, is_read) values
  ('241339', 'request_confirmed', 'Dr. Sara Hassan confirmed your request "Floci Lambda deployment question". Check your email for the QR code.', '/student/requests', false),
  ('240101', 'request_rejected',  'Dr. Sara Hassan rejected your request "Project deadline date".', '/student/requests', false),
  ('I-1001', 'request_created',   'New request from Ahmed Ellebishy: "Clarification on cloud service models".', '/instructor/inbox', false),
  ('I-1003', 'request_created',   'New request from Mariam Samir: "Backpropagation derivation".', '/instructor/inbox', false),
  ('248690', 'meeting_completed', 'Your meeting with Dr. Omar Nabil was completed. Notes are in your history.', '/student/history', true);
