#!/usr/bin/env python3
"""Generate and execute LMS seed SQL on the test server."""
import paramiko, sys, uuid, os

def uid(): return str(uuid.uuid4())

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('163.227.174.141', username='empcloud-development', password=os.environ.get('SSH_PASSWORD', ''))

cat_tech = 'eae171b4-a435-4eba-b0c6-3c15c270686f'
cat_soft = 'ebd29783-3361-4e1f-a86e-c0b3ab75da17'
cat_comp = 'da320d0a-be57-4240-9a05-339abd74e703'
cat_web  = 'cbcfc093-74bd-4c20-b623-1af4770e5db7'
js_id    = '8b60ef31-755b-4b87-b482-157c8cfc15ba'
lead_id  = '218a8cb0-353f-45c6-9366-8e599cf2ffc1'
c = {k: uid() for k in ['python','react','security','gdpr','comm','agile','data','cloud']}
lp1, lp2, lp3 = uid(), uid(), uid()

sql_lines = []
sql_lines.append(f"""INSERT INTO courses (id,org_id,title,slug,description,short_description,category_id,difficulty,duration_minutes,status,created_by,instructor_id,passing_score,is_featured,enrollment_count,completion_count,avg_rating,rating_count,published_at,prerequisites,tags,completion_criteria) VALUES
("{c['python']}",1,"Python for Data Science","python-data-science","Learn Python for data analysis.","Master Python","{cat_tech}","intermediate",600,"published",1,2,75,1,45,12,4.5,20,NOW(),"[]","[]","all_lessons"),
("{c['react']}",1,"React & TypeScript Masterclass","react-typescript","Build modern web apps.","Production React","{cat_web}","advanced",720,"published",1,2,80,1,38,8,4.7,15,NOW(),"[]","[]","all_lessons"),
("{c['security']}",1,"Cybersecurity Awareness","cybersecurity-awareness","Essential cybersecurity training.","Cyber protection","{cat_comp}","beginner",180,"published",1,2,85,0,120,95,4.2,80,NOW(),"[]","[]","quiz_pass"),
("{c['gdpr']}",1,"GDPR & Data Privacy","gdpr-data-privacy","GDPR regulations and compliance.","GDPR compliance","{cat_comp}","intermediate",240,"published",1,2,90,0,85,72,4.0,50,NOW(),"[]","[]","quiz_pass"),
("{c['comm']}",1,"Business Communication","business-communication","Professional communication skills.","Communicate effectively","{cat_soft}","beginner",300,"published",1,2,70,0,65,40,4.3,35,NOW(),"[]","[]","all_lessons"),
("{c['agile']}",1,"Agile & Scrum Fundamentals","agile-scrum","Agile and Scrum framework.","Master Agile","{cat_tech}","intermediate",360,"published",1,2,75,1,52,30,4.6,28,NOW(),"[]","[]","all_lessons"),
("{c['data']}",1,"SQL & Database Fundamentals","sql-databases","SQL querying and database design.","Master SQL","{cat_tech}","beginner",420,"published",1,2,70,0,70,25,4.4,40,NOW(),"[]","[]","all_lessons"),
("{c['cloud']}",1,"AWS Cloud Practitioner","aws-cloud-practitioner","AWS certification prep.","Get AWS certified","{cat_tech}","intermediate",480,"published",1,2,80,1,30,10,4.8,12,NOW(),"[]","[]","quiz_pass");""")

enrollments = []
for cid, uid_, status, prog, days_ago in [
    (c['python'], 1, 'in_progress', 65, 30),
    (c['security'], 1, 'completed', 100, 60),
    (c['react'], 2, 'in_progress', 40, 14),
    (c['gdpr'], 2, 'completed', 100, 45),
    (c['comm'], 3, 'in_progress', 25, 7),
    (c['agile'], 1, 'enrolled', 0, 2),
    (c['cloud'], 2, 'enrolled', 0, 1),
    (c['data'], 3, 'in_progress', 50, 20),
    (js_id, 2, 'completed', 100, 90),
    (lead_id, 3, 'in_progress', 75, 21),
]:
    eid = uid()
    started = f'NOW()-INTERVAL {days_ago-2} DAY' if status != 'enrolled' else 'NULL'
    accessed = f'NOW()-INTERVAL 1 DAY' if status != 'enrolled' else 'NULL'
    enrollments.append(f'("{eid}",1,"{cid}",{uid_},"{status}",{prog},NOW()-INTERVAL {days_ago} DAY,{started},{accessed})')

sql_lines.append(f"INSERT INTO enrollments (id,org_id,course_id,user_id,status,progress_percentage,enrolled_at,started_at,last_accessed_at) VALUES\n" + ",\n".join(enrollments) + ";")

sql_lines.append(f"""INSERT INTO learning_paths (id,org_id,title,slug,description,difficulty,status,created_by,is_mandatory,estimated_duration_minutes) VALUES
("{lp1}",1,"Full-Stack Developer Path","fullstack-developer","JavaScript, React, SQL, cloud.","advanced","published",1,0,2220),
("{lp2}",1,"Compliance Essentials","compliance-essentials","Mandatory cybersecurity and GDPR.","beginner","published",1,1,420),
("{lp3}",1,"Emerging Leaders Program","emerging-leaders","Leadership and communication.","intermediate","published",1,0,960);""")

lpc = []
for lpid, cid, order, mand in [
    (lp1,js_id,1,1),(lp1,c['react'],2,1),(lp1,c['data'],3,1),(lp1,c['cloud'],4,0),
    (lp2,c['security'],1,1),(lp2,c['gdpr'],2,1),
    (lp3,lead_id,1,1),(lp3,c['comm'],2,1),(lp3,c['agile'],3,0),
]:
    lpc.append(f'("{uid()}","{lpid}","{cid}",{order},{mand})')
sql_lines.append(f"INSERT INTO learning_path_courses (id,learning_path_id,course_id,sort_order,is_mandatory) VALUES\n" + ",".join(lpc) + ";")

sql_lines.append(f"""INSERT INTO compliance_assignments (id,org_id,course_id,assigned_to_type,assigned_to_value,due_date,is_mandatory,created_by) VALUES
("{uid()}",1,"{c['security']}","all","all",NOW()+INTERVAL 30 DAY,1,1),
("{uid()}",1,"{c['gdpr']}","all","all",NOW()+INTERVAL 60 DAY,1,1);""")

sql_lines.append(f"""INSERT INTO ilt_sessions (id,org_id,course_id,title,description,instructor_id,session_type,location,start_time,end_time,max_capacity,registered_count,status) VALUES
("{uid()}",1,"{lead_id}","Leadership Workshop Q1","Interactive workshop.",2,"in_person","Conference Room A",NOW()+INTERVAL 7 DAY,NOW()+INTERVAL 7 DAY+INTERVAL 4 HOUR,25,18,"scheduled"),
("{uid()}",1,"{c['agile']}","Agile Bootcamp","Intensive Scrum training.",2,"virtual","https://meet.google.com/abc",NOW()+INTERVAL 14 DAY,NOW()+INTERVAL 14 DAY+INTERVAL 6 HOUR,30,22,"scheduled"),
("{uid()}",1,"{c['comm']}","Presentation Skills","Public speaking workshop.",2,"in_person","Training Hall B",NOW()+INTERVAL 21 DAY,NOW()+INTERVAL 21 DAY+INTERVAL 3 HOUR,20,15,"scheduled");""")

sql_lines.append(f"""INSERT INTO certificates (id,org_id,user_id,course_id,certificate_number,issued_at,status,certificate_template_id) VALUES
("{uid()}",1,1,"{c['security']}","CERT-2026-001",NOW()-INTERVAL 45 DAY,"active",(SELECT id FROM certificate_templates LIMIT 1)),
("{uid()}",1,2,"{c['gdpr']}","CERT-2026-002",NOW()-INTERVAL 30 DAY,"active",(SELECT id FROM certificate_templates LIMIT 1)),
("{uid()}",1,2,"{js_id}","CERT-2026-003",NOW()-INTERVAL 70 DAY,"active",(SELECT id FROM certificate_templates LIMIT 1));""")

sql_lines.append(f"""INSERT INTO course_ratings (id,org_id,course_id,user_id,rating,review,created_at) VALUES
("{uid()}",1,"{js_id}",2,5,"Excellent course!",NOW()-INTERVAL 60 DAY),
("{uid()}",1,"{c['security']}",1,4,"Very informative.",NOW()-INTERVAL 40 DAY),
("{uid()}",1,"{c['gdpr']}",2,4,"Comprehensive coverage.",NOW()-INTERVAL 25 DAY),
("{uid()}",1,"{lead_id}",3,5,"Transformed my approach.",NOW()-INTERVAL 10 DAY);""")

sql_lines.append(f"""INSERT INTO discussions (id,org_id,course_id,user_id,title,content,created_at) VALUES
("{uid()}",1,"{js_id}",2,"Async/Await vs Promises?","When to use async/await?",NOW()-INTERVAL 5 DAY),
("{uid()}",1,"{c['react']}",2,"Zustand vs Redux?","Trade-offs?",NOW()-INTERVAL 3 DAY),
("{uid()}",1,"{c['security']}",1,"Phishing simulation tools?","Any recommendations?",NOW()-INTERVAL 7 DAY);""")

full_sql = "\n".join(sql_lines)

# Upload SQL file
sftp = ssh.open_sftp()
with sftp.file('/tmp/lms_seed.sql', 'w') as f:
    f.write(full_sql)
sftp.close()
print("SQL uploaded")

# Execute
db_pass = os.environ.get('DB_PASSWORD', '')
stdin, stdout, stderr = ssh.exec_command(f"mysql -u empcloud -p{db_pass} emp_lms < /tmp/lms_seed.sql 2>&1 | grep -v Warning", timeout=30)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(f"Result: {out}{err}")

# Verify
for t in ['courses','enrollments','learning_paths','learning_path_courses','certificates','ilt_sessions','compliance_assignments','discussions','course_ratings']:
    stdin, stdout, stderr = ssh.exec_command(f"mysql -u empcloud -p{os.environ.get('DB_PASSWORD', '')} emp_lms -e 'SELECT COUNT(*) as c FROM {t}' 2>&1 | grep -v Warning | tail -1")
    print(f"{t}: {stdout.read().decode().strip()}")

ssh.close()
