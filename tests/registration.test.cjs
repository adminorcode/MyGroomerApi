const { test } = require('node:test')
const assert = require('node:assert/strict')
const { saveRegistrationSchema, newAttachmentSchema, validDocument, validBrazilPhone, MAX_ATTACHMENT_BYTES } = require('../dist/modules/provider/registration.schemas')

const complete = {
    name:'Maria da Silva', email:'registration@example.test', phone_number:'+5511987654321',
    document:'52998224725', experience:'Cinco anos cuidando de pets.', certifications:'Curso de banho e tosa.',
    professional_type_ids:['10000000-0000-4000-8000-000000000001'], attachments:[], mode:'continue',
}
const attachment = (mime_type, name, content) => ({ name, mime_type, size: content.length, base64: content.toString('base64') })

test('CPF/CNPJ check digits and Brazilian phone are checked', () => {
    for (const document of ['529.982.247-25', '11.222.333/0001-81']) assert.equal(validDocument(document), true)
    for (const document of ['11111111111', '52998224724', '11222333000180', '']) assert.equal(validDocument(document), false)
    for (const phone of ['+5511987654321', '(11) 98765-4321', '+551132345678']) assert.equal(validBrazilPhone(phone), true)
    for (const phone of ['+233200000000', '+5501987654321', '1198765']) assert.equal(validBrazilPhone(phone), false)
})

test('Continue requires all fields and a type; draft accepts incomplete fields', () => {
    assert.equal(saveRegistrationSchema.safeParse(complete).success, true)
    for (const key of ['name','email','phone_number','document','experience','certifications']) {
        assert.equal(saveRegistrationSchema.safeParse({...complete,[key]:''}).success, false, key)
    }
    assert.equal(saveRegistrationSchema.safeParse({...complete,professional_type_ids:[]}).success, false)
    assert.equal(saveRegistrationSchema.safeParse({...complete,mode:'draft',name:'',phone_number:'',document:'',experience:'',certifications:'',professional_type_ids:[]}).success, true)
    assert.equal(saveRegistrationSchema.safeParse({...complete,is_verified:true}).success, false)
})

test('both descriptions accept 500 and reject 501 characters', () => {
    for (const field of ['experience','certifications']) {
        assert.equal(saveRegistrationSchema.safeParse({...complete,[field]:'a'.repeat(500)}).success, true)
        assert.equal(saveRegistrationSchema.safeParse({...complete,[field]:'a'.repeat(501)}).success, false)
    }
})

test('JPG PNG PDF signatures, base64, size and declared extension agree', () => {
    const files = [
        attachment('image/jpeg', 'foto.jpg', Buffer.from([255,216,255,224,0,1])),
        attachment('image/png', 'foto.png', Buffer.from([137,80,78,71,13,10,26,10,0,0])),
        attachment('application/pdf', 'curso.pdf', Buffer.from('%PDF-1.4\n%%EOF')),
    ]
    for (const file of files) assert.equal(newAttachmentSchema.safeParse(file).success, true, file.name)
    assert.equal(newAttachmentSchema.safeParse({...files[0],mime_type:'application/pdf',name:'fake.pdf'}).success, false)
    assert.equal(newAttachmentSchema.safeParse({...files[1],name:'fake.exe'}).success, false)
    assert.equal(newAttachmentSchema.safeParse({...files[2],size:files[2].size+1}).success, false)
    assert.equal(newAttachmentSchema.safeParse({...files[2],base64:files[2].base64+'!'}).success, false)
    assert.equal(newAttachmentSchema.safeParse({...files[2],mime_type:'text/plain'}).success, false)
    assert.equal(saveRegistrationSchema.safeParse({...complete,attachments:Array(6).fill(files[2])}).success, false)
})

test('10 MiB is accepted, one additional byte is rejected', () => {
    const content = Buffer.alloc(MAX_ATTACHMENT_BYTES)
    content.write('%PDF-1.4')
    const exact = attachment('application/pdf', 'limite.pdf', content)
    assert.equal(newAttachmentSchema.safeParse(exact).success, true)
    assert.equal(newAttachmentSchema.safeParse(attachment('application/pdf','grande.pdf',Buffer.concat([content,Buffer.from([0])]))).success, false)
})
