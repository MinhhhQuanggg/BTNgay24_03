var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require('../utils/uploadHandler')
let exceljs = require('exceljs')
let path = require('path')
let fs = require('fs')
let crypto = require('crypto')
let mongoose = require('mongoose');
let productModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let categoryModel = require('../schemas/categories')
let roleModel = require('../schemas/roles')
let userModel = require('../schemas/users')
let userController = require('../controllers/users')
let { sendUserPasswordMail } = require('../utils/mailHandler')
let slugify = require('slugify')

function getCellValue(cell) {
    if (!cell || cell.value == null) {
        return '';
    }
    if (typeof cell.value === 'object') {
        if (cell.value.text) {
            return String(cell.value.text).trim();
        }
        if (cell.value.result) {
            return String(cell.value.result).trim();
        }
    }
    return String(cell.value).trim();
}

function generateRandomPassword() {
    return crypto.randomBytes(8).toString('hex');
}

router.post('/an_image', uploadImage.single('file')
    , function (req, res, next) {
        if (!req.file) {
            res.send({
                message: "file khong duoc rong"
            })
        } else {
            res.send({
                filename: req.file.filename,
                path: req.file.path,
                size: req.file.size
            })
        }
    })
router.get('/:filename', function (req, res, next) {
    let filename = path.join(__dirname, '../uploads', req.params.filename)
    res.sendFile(filename)
})

router.post('/multiple_images', uploadImage.array('files', 5)
    , function (req, res, next) {
        if (!req.files) {
            res.send({
                message: "file khong duoc rong"
            })
        } else {
            // res.send({
            //     filename: req.file.filename,
            //     path: req.file.path,
            //     size: req.file.size
            // })

            res.send(req.files.map(f => {
                return {
                    filename: f.filename,
                    path: f.path,
                    size: f.size
                }
            }))
        }
    })

router.post('/excel', uploadExcel.single('file')
    , async function (req, res, next) {
        if (!req.file) {
            res.send({
                message: "file khong duoc rong"
            })
        } else {
            //wookbook->worksheet->row/column->cell
            let workBook = new exceljs.Workbook()
            let filePath = path.join(__dirname, '../uploads', req.file.filename)
            await workBook.xlsx.readFile(filePath)
            let worksheet = workBook.worksheets[0];
            let result = [];

            let categoryMap = new Map();
            let categories = await categoryModel.find({
            })
            for (const category of categories) {
                categoryMap.set(category.name, category._id)
            }

            let products = await productModel.find({})
            let getTitle = products.map(
                p => p.title
            )
            let getSku = products.map(
                p => p.sku
            )

            for (let index = 2; index <= worksheet.rowCount; index++) {
                let errorsRow = [];
                const element = worksheet.getRow(index);
                let sku = element.getCell(1).value;
                let title = element.getCell(2).value;
                let category = element.getCell(3).value;
                let price = Number.parseInt(element.getCell(4).value);
                let stock = Number.parseInt(element.getCell(5).value);

                if (price < 0 || isNaN(price)) {
                    errorsRow.push("price khong duoc nho hon 0 va la so")
                }
                if (stock < 0 || isNaN(stock)) {
                    errorsRow.push("stock khong duoc nho hon 0 va la so")
                }
                if (!categoryMap.has(category)) {
                    errorsRow.push("category khong hop le")
                }
                if (getSku.includes(sku)) {
                    errorsRow.push("sku da ton tai")
                }
                if (getTitle.includes(title)) {
                    errorsRow.push("title da ton tai")
                }

                if (errorsRow.length > 0) {
                    result.push({
                        success: false,
                        data: errorsRow
                    })
                    continue;
                }
                let session = await mongoose.startSession()
                session.startTransaction()
                try {
                    let newProducts = new productModel({
                        sku: sku,
                        title: title,
                        slug: slugify(title, {
                            replacement: '-',
                            lower: false,
                            remove: undefined,
                        }),
                        description: title,
                        category: categoryMap.get(category),
                        price: price
                    })
                    await newProducts.save({ session })
                    let newInventory = new inventoryModel({
                        product: newProducts._id,
                        stock: stock
                    })
                    await newInventory.save({ session });
                    await newInventory.populate('product')
                    await session.commitTransaction();
                    await session.endSession()
                    getTitle.push(title);
                    getSku.push(sku)
                    result.push({
                        success: true,
                        data: newInventory
                    })
                } catch (error) {
                    await session.abortTransaction();
                    await session.endSession()
                    result.push({
                        success: false,
                        data: error.message
                    })
                }
            }
            fs.unlinkSync(filePath)
            result = result.map((r, index) => {
                if (r.success) {
                    return {
                        [index + 1]: r.data
                    }
                } else {
                    return {
                        [index + 1]: r.data.join(',')
                    }
                }
            })
            res.send(result)
        }

    })

router.post('/excel/users', uploadExcel.single('file')
    , async function (req, res, next) {
        if (!req.file) {
            return res.send({
                message: "file khong duoc rong"
            })
        }

        const workBook = new exceljs.Workbook()
        const filePath = path.join(__dirname, '../uploads', req.file.filename)

        try {
            await workBook.xlsx.readFile(filePath)
            const worksheet = workBook.worksheets[0];
            const result = [];

            const userRole = await roleModel.findOne({
                isDeleted: false,
                name: { $regex: /^user$/i }
            })

            if (!userRole) {
                return res.status(400).send({
                    message: "khong tim thay role user"
                })
            }

            const users = await userModel.find({
                isDeleted: false
            }).select('username email')

            const existingUsernameSet = new Set(users.map(item => item.username))
            const existingEmailSet = new Set(users.map(item => item.email))
            const fileUsernameSet = new Set()
            const fileEmailSet = new Set()

            for (let index = 2; index <= worksheet.rowCount; index++) {
                const row = worksheet.getRow(index);
                const username = getCellValue(row.getCell(1));
                const email = getCellValue(row.getCell(2)).toLowerCase();
                const errorsRow = [];

                if (!username) {
                    errorsRow.push("username khong duoc de trong")
                }
                if (!email) {
                    errorsRow.push("email khong duoc de trong")
                } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    errorsRow.push("email sai dinh dang")
                }

                if (existingUsernameSet.has(username)) {
                    errorsRow.push("username da ton tai")
                }
                if (existingEmailSet.has(email)) {
                    errorsRow.push("email da ton tai")
                }
                if (fileUsernameSet.has(username)) {
                    errorsRow.push("username bi trung trong file")
                }
                if (fileEmailSet.has(email)) {
                    errorsRow.push("email bi trung trong file")
                }

                if (errorsRow.length > 0) {
                    result.push({
                        row: index,
                        success: false,
                        data: errorsRow
                    })
                    continue;
                }

                fileUsernameSet.add(username)
                fileEmailSet.add(email)

                const password = generateRandomPassword();

                try {
                    const newUser = await userController.CreateAnUser(
                        username,
                        password,
                        email,
                        userRole._id
                    )

                    let mailSent = false;
                    let mailError = null;

                    try {
                        await sendUserPasswordMail(email, username, password)
                        mailSent = true;
                    } catch (error) {
                        mailError = error.message;
                    }

                    existingUsernameSet.add(username)
                    existingEmailSet.add(email)

                    result.push({
                        row: index,
                        success: true,
                        data: {
                            _id: newUser._id,
                            username: newUser.username,
                            email: newUser.email,
                            role: userRole.name,
                            mailSent: mailSent,
                            mailError: mailError
                        }
                    })
                } catch (error) {
                    result.push({
                        row: index,
                        success: false,
                        data: [error.message]
                    })
                }
            }

            return res.send(result)
        } catch (error) {
            return res.status(400).send({
                message: error.message
            })
        } finally {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
            }
        }
    })
module.exports = router;
